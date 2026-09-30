-- ===================================================================
-- Vendors need a phone number on their profile to accept orders
-- (riders call them at pickup). See docs/ORDER_FLOW.md.
-- ===================================================================

-- A usable phone number: at least 7 digits (placeholder text like "No phone" doesn't count)
CREATE OR REPLACE FUNCTION public.is_valid_phone(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT length(regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g')) >= 7;
$$;

-- The rider profile screen used to save the text "No phone" when a rider had none
UPDATE public.profiles SET phone = NULL WHERE phone IS NOT NULL AND NOT public.is_valid_phone(phone);

-- Vendor: accept a paid order (creates both handover codes).
-- The vendor must have a phone number on their profile.
CREATE OR REPLACE FUNCTION public.vendor_accept_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'vendor');
BEGIN
  -- Riders and customers need a number to reach the vendor
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = o.vendor_id AND public.is_valid_phone(phone)) THEN
    RAISE EXCEPTION 'Add a phone number to your profile before accepting orders';
  END IF;
  IF o.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'This order hasn''t been paid for yet';
  END IF;
  IF o.status <> 'pending' THEN
    RAISE EXCEPTION 'Only new orders can be accepted';
  END IF;

  UPDATE public.orders SET status = 'accepted', vendor_accepted_at = now() WHERE id = o.id;

  INSERT INTO public.order_handover_codes (order_id, kind, code)
  VALUES (o.id, 'pickup', public.new_handover_code()),
         (o.id, 'delivery', public.new_handover_code())
  ON CONFLICT (order_id, kind) DO NOTHING;
END;
$$;
