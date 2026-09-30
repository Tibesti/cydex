-- ===================================================================
-- Wallet balances are only changed by the database
--
-- Before: each user could insert and update their own wallet row, and the
-- browser deducted payouts itself, so anyone could set their own balance.
-- Now users can only read their wallet. Balances change through:
--   - order settlement and refunds (existing triggers / refund_order)
--   - request_payout(): checks and deducts the balance in one step
--   - settle_payout(): the squad-payout Edge Function records the transfer
--     result, putting the money back if the transfer failed
-- ===================================================================

-- ===================================================================
-- 1. Wallets are created by the database
-- ===================================================================

CREATE OR REPLACE FUNCTION public.create_wallet_for(p_profile_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE lower(p_role)
    WHEN 'customer' THEN
      INSERT INTO public.customer_wallet (customer_id) VALUES (p_profile_id) ON CONFLICT (customer_id) DO NOTHING;
    WHEN 'vendor' THEN
      INSERT INTO public.vendor_wallet (vendor_id) VALUES (p_profile_id) ON CONFLICT (vendor_id) DO NOTHING;
    WHEN 'rider' THEN
      INSERT INTO public.rider_wallet (rider_id) VALUES (p_profile_id) ON CONFLICT (rider_id) DO NOTHING;
    ELSE
      NULL;
  END CASE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_wallet_for(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_wallet_on_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_wallet_for(NEW.id, NEW.role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_wallet_on_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_wallet_on_profile();

-- Existing accounts
SELECT public.create_wallet_for(id, role) FROM public.profiles;

-- The signed-in user's wallet, created if it's somehow missing
CREATE OR REPLACE FUNCTION public.ensure_my_wallet()
RETURNS TABLE (id UUID, virtual_account_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := public.current_user_role();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  PERFORM public.create_wallet_for(auth.uid(), v_role);
  IF v_role = 'customer' THEN
    RETURN QUERY SELECT w.id, w.virtual_account_id FROM public.customer_wallet w WHERE w.customer_id = auth.uid();
  ELSIF v_role = 'vendor' THEN
    RETURN QUERY SELECT w.id, w.virtual_account_id FROM public.vendor_wallet w WHERE w.vendor_id = auth.uid();
  ELSIF v_role = 'rider' THEN
    RETURN QUERY SELECT w.id, w.virtual_account_id FROM public.rider_wallet w WHERE w.rider_id = auth.uid();
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_my_wallet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_wallet() TO authenticated;

-- A new virtual account is linked to its owner's wallet automatically
CREATE OR REPLACE FUNCTION public.link_wallet_to_virtual_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_wallet_for(NEW.profile_id, NEW.role);
  CASE NEW.role
    WHEN 'customer' THEN UPDATE public.customer_wallet SET virtual_account_id = NEW.id WHERE customer_id = NEW.profile_id;
    WHEN 'vendor' THEN UPDATE public.vendor_wallet SET virtual_account_id = NEW.id WHERE vendor_id = NEW.profile_id;
    WHEN 'rider' THEN UPDATE public.rider_wallet SET virtual_account_id = NEW.id WHERE rider_id = NEW.profile_id;
    ELSE NULL;
  END CASE;
  RETURN NEW;
END;
$$;

CREATE TRIGGER link_wallet_to_virtual_account
  AFTER INSERT ON public.virtual_accounts
  FOR EACH ROW EXECUTE FUNCTION public.link_wallet_to_virtual_account();

UPDATE public.customer_wallet w SET virtual_account_id = va.id
FROM public.virtual_accounts va
WHERE va.profile_id = w.customer_id AND va.role = 'customer' AND w.virtual_account_id IS NULL;
UPDATE public.vendor_wallet w SET virtual_account_id = va.id
FROM public.virtual_accounts va
WHERE va.profile_id = w.vendor_id AND va.role = 'vendor' AND w.virtual_account_id IS NULL;
UPDATE public.rider_wallet w SET virtual_account_id = va.id
FROM public.virtual_accounts va
WHERE va.profile_id = w.rider_id AND va.role = 'rider' AND w.virtual_account_id IS NULL;

-- Users can read their wallet but not write it
DROP POLICY IF EXISTS "Customers can create their own wallet" ON public.customer_wallet;
DROP POLICY IF EXISTS "Customers can update their own wallet" ON public.customer_wallet;
DROP POLICY IF EXISTS "Vendors can create their own wallet" ON public.vendor_wallet;
DROP POLICY IF EXISTS "Vendors can update their own wallet" ON public.vendor_wallet;
DROP POLICY IF EXISTS "Riders can create their own wallet" ON public.rider_wallet;
DROP POLICY IF EXISTS "Riders can update their own wallet" ON public.rider_wallet;

-- Only used by old browser webhook code; payments are confirmed server-side now
REVOKE EXECUTE ON FUNCTION public.update_customer_wallet_on_payment(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- 2. Payouts / withdrawals
--   pending    request created, balance already deducted
--   processing transfer sent to Squad
--   completed  Squad confirmed the transfer
--   failed     transfer failed; the amount went back to the wallet
-- ===================================================================

CREATE OR REPLACE FUNCTION public.payout_fee_rate()
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 0.015::numeric $$;

-- Deducts the amount and creates the payout request. The squad-payout Edge
-- Function then sends the transfer. Returns the request id.
CREATE OR REPLACE FUNCTION public.request_payout(p_amount NUMERIC, p_bank_account_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := public.current_user_role();
  v_uid UUID := auth.uid();
  v_amount NUMERIC := round(p_amount, 2);
  v_fee NUMERIC := round(round(p_amount, 2) * public.payout_fee_rate(), 2);
  v_balance NUMERIC;
  v_bank_code TEXT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Enter an amount greater than zero';
  END IF;

  IF v_role = 'vendor' THEN
    SELECT bank_code INTO v_bank_code FROM public.vendor_bank_accounts WHERE id = p_bank_account_id AND vendor_id = v_uid;
    SELECT available_balance INTO v_balance FROM public.vendor_wallet WHERE vendor_id = v_uid FOR UPDATE;
  ELSIF v_role = 'rider' THEN
    SELECT bank_code INTO v_bank_code FROM public.rider_bank_details WHERE id = p_bank_account_id AND rider_id = v_uid;
    SELECT available_balance INTO v_balance FROM public.rider_wallet WHERE rider_id = v_uid FOR UPDATE;
  ELSIF v_role = 'customer' THEN
    SELECT bank_code INTO v_bank_code FROM public.customer_bank_accounts WHERE id = p_bank_account_id AND customer_id = v_uid;
    SELECT available_balance INTO v_balance FROM public.customer_wallet WHERE customer_id = v_uid FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'Withdrawals aren''t available for this account';
  END IF;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF v_bank_code IS NULL OR v_bank_code = '' THEN
    RAISE EXCEPTION 'Bank account not found or missing its bank code. Please update your bank details.';
  END IF;
  IF COALESCE(v_balance, 0) < v_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  IF v_role = 'vendor' THEN
    UPDATE public.vendor_wallet
    SET available_balance = available_balance - v_amount, total_withdrawn = total_withdrawn + v_amount, updated_at = now()
    WHERE vendor_id = v_uid;
    INSERT INTO public.vendor_payout_requests (vendor_id, bank_account_id, amount, fee, net_amount, status)
    VALUES (v_uid, p_bank_account_id, v_amount, v_fee, v_amount - v_fee, 'pending') RETURNING id INTO v_id;
  ELSIF v_role = 'rider' THEN
    UPDATE public.rider_wallet
    SET available_balance = available_balance - v_amount, total_withdrawn = total_withdrawn + v_amount, updated_at = now()
    WHERE rider_id = v_uid;
    INSERT INTO public.rider_payout_requests (rider_id, bank_account_id, amount, fee, net_amount, status)
    VALUES (v_uid, p_bank_account_id, v_amount, v_fee, v_amount - v_fee, 'pending') RETURNING id INTO v_id;
  ELSE
    UPDATE public.customer_wallet
    SET available_balance = available_balance - v_amount, updated_at = now()
    WHERE customer_id = v_uid;
    INSERT INTO public.customer_withdrawal_requests (customer_id, bank_account_id, amount, fee, net_amount, status)
    VALUES (v_uid, p_bank_account_id, v_amount, v_fee, v_amount - v_fee, 'pending') RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_payout(NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(NUMERIC, UUID) TO authenticated;

-- Records a transfer result (service role only). Moving to 'failed' puts the
-- amount back in the wallet, once.
CREATE OR REPLACE FUNCTION public.settle_payout(
  p_role TEXT, p_id UUID, p_status TEXT, p_reference TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL, p_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_amount NUMERIC;
  v_old TEXT;
BEGIN
  IF p_status NOT IN ('pending', 'processing', 'completed', 'failed') THEN
    RAISE EXCEPTION 'Unknown payout status %', p_status;
  END IF;

  IF p_role = 'vendor' THEN
    SELECT vendor_id, amount, status INTO v_owner, v_amount, v_old FROM public.vendor_payout_requests WHERE id = p_id FOR UPDATE;
  ELSIF p_role = 'rider' THEN
    SELECT rider_id, amount, status INTO v_owner, v_amount, v_old FROM public.rider_payout_requests WHERE id = p_id FOR UPDATE;
  ELSIF p_role = 'customer' THEN
    SELECT customer_id, amount, status INTO v_owner, v_amount, v_old FROM public.customer_withdrawal_requests WHERE id = p_id FOR UPDATE;
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Payout request not found';
  END IF;
  -- Final states don't change
  IF v_old IN ('completed', 'failed', 'cancelled') THEN
    RETURN v_old;
  END IF;

  IF p_role = 'vendor' THEN
    UPDATE public.vendor_payout_requests
    SET status = p_status, transfer_reference = COALESCE(p_reference, transfer_reference),
        transfer_metadata = COALESCE(p_metadata, transfer_metadata), failure_reason = p_reason,
        processed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE processed_at END, updated_at = now()
    WHERE id = p_id;
  ELSIF p_role = 'rider' THEN
    UPDATE public.rider_payout_requests
    SET status = p_status, transfer_reference = COALESCE(p_reference, transfer_reference),
        transfer_metadata = COALESCE(p_metadata, transfer_metadata), failure_reason = p_reason,
        processed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE processed_at END, updated_at = now()
    WHERE id = p_id;
  ELSE
    UPDATE public.customer_withdrawal_requests
    SET status = p_status, transfer_reference = COALESCE(p_reference, transfer_reference),
        transfer_metadata = COALESCE(p_metadata, transfer_metadata), failure_reason = p_reason,
        processed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE processed_at END, updated_at = now()
    WHERE id = p_id;
  END IF;

  IF p_status = 'failed' THEN
    IF p_role = 'vendor' THEN
      UPDATE public.vendor_wallet
      SET available_balance = available_balance + v_amount, total_withdrawn = total_withdrawn - v_amount, updated_at = now()
      WHERE vendor_id = v_owner;
    ELSIF p_role = 'rider' THEN
      UPDATE public.rider_wallet
      SET available_balance = available_balance + v_amount, total_withdrawn = total_withdrawn - v_amount, updated_at = now()
      WHERE rider_id = v_owner;
    ELSE
      UPDATE public.customer_wallet
      SET available_balance = available_balance + v_amount, updated_at = now()
      WHERE customer_id = v_owner;
    END IF;
    PERFORM public.notify_user(v_owner, 'payout_failed', 'Withdrawal failed',
      '₦' || to_char(v_amount, 'FM999,999,990.00') || ' couldn''t be sent to your bank and is back in your wallet.'
      || COALESCE(' Reason: ' || p_reason, ''));
  ELSIF p_status = 'completed' THEN
    PERFORM public.notify_user(v_owner, 'payout_completed', 'Withdrawal sent',
      '₦' || to_char(v_amount, 'FM999,999,990.00') || ' has been sent to your bank account.');
  END IF;

  RETURN p_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_payout(TEXT, UUID, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payout(TEXT, UUID, TEXT, TEXT, JSONB, TEXT) TO service_role;

-- Users can see their payout requests but not create or change them directly
DROP POLICY IF EXISTS "Vendors can manage their own payout requests" ON public.vendor_payout_requests;
DROP POLICY IF EXISTS "Riders can manage their own payout requests" ON public.rider_payout_requests;
DROP POLICY IF EXISTS "Customers can create their own withdrawal requests" ON public.customer_withdrawal_requests;
DROP POLICY IF EXISTS "Customers can update their own withdrawal requests" ON public.customer_withdrawal_requests;

CREATE POLICY "Vendors can view their payout requests" ON public.vendor_payout_requests
  FOR SELECT USING (vendor_id = auth.uid());
CREATE POLICY "Riders can view their payout requests" ON public.rider_payout_requests
  FOR SELECT USING (rider_id = auth.uid());
DROP POLICY IF EXISTS "Admins can manage rider payout requests" ON public.rider_payout_requests;
CREATE POLICY "Admins can manage rider payout requests" ON public.rider_payout_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
