-- Vendors and riders can't withdraw less than ₦3,000 at a time.
-- (Customers withdrawing a refund aren't limited.) The amount is kept in
-- app_config so it can be changed without a code change.

INSERT INTO public.app_config (key, value) VALUES ('min_payout_amount', '3000')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.min_payout_amount()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT NULLIF(value, '')::numeric FROM public.app_config WHERE key = 'min_payout_amount'), 3000);
$$;
REVOKE EXECUTE ON FUNCTION public.min_payout_amount() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.min_payout_amount() TO authenticated;

CREATE OR REPLACE FUNCTION public.request_payout(p_amount numeric, p_bank_account_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF v_role IN ('vendor', 'rider') AND v_amount < public.min_payout_amount() THEN
    RAISE EXCEPTION 'The smallest amount you can withdraw is ₦%', to_char(public.min_payout_amount(), 'FM999,999,990');
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
$function$;
