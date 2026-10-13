-- ===================================================================
-- Cydex Express, and updated rider requests
--   Cydex Express: a customer sends an item from A to B. It's an order with
--   order_type = 'express': no vendor and no items; pickup_address is A
--   (with the sender's name and phone), delivery_address is B (with the
--   recipient's name, phone and email). The customer pays the delivery fee
--   plus the Service Charge rate on it (wallet first, then Squad). Once paid
--   it's ready for a rider; the sender confirms pickup with the rider's
--   code and passes the delivery code to the recipient.
--   Rider requests (vendors) now also take the recipient's email and a
--   preferred delivery mode, and are priced by that mode.
--   Recipients are emailed their delivery code with an invitation to Cydex.
-- ===================================================================

ALTER TABLE public.vendor_customers ADD COLUMN IF NOT EXISTS email TEXT;

CREATE OR REPLACE FUNCTION public.is_valid_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$ SELECT COALESCE(trim(p_email), '') ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' $$;

-- ===================================================================
-- 1. Emails to people without an account (the recipient of a delivery)
-- ===================================================================

CREATE OR REPLACE FUNCTION public.queue_email_to(p_email TEXT, p_template TEXT, p_subject TEXT, p_data JSONB)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.email_outbox (profile_id, to_email, template, subject, data)
  SELECT NULL, lower(trim(p_email)), p_template, p_subject, p_data
  WHERE public.is_valid_email(p_email);
$$;

REVOKE EXECUTE ON FUNCTION public.queue_email_to(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- The recipient's delivery code, who it's from, and an invitation to Cydex
CREATE OR REPLACE FUNCTION public.email_delivery_code(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_code TEXT;
  v_sender TEXT;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF o.id IS NULL OR NOT public.is_valid_email(o.delivery_address ->> 'email') THEN
    RETURN;
  END IF;
  SELECT code INTO v_code FROM public.order_handover_codes WHERE order_id = o.id AND kind = 'delivery';
  SELECT name INTO v_sender FROM public.profiles WHERE id = COALESCE(o.vendor_id, o.customer_id);
  PERFORM public.queue_email_to(
    o.delivery_address ->> 'email', 'delivery_code',
    'Your delivery from ' || COALESCE(v_sender, 'Cydex') || ' is on its way',
    jsonb_build_object(
      'name', o.delivery_address ->> 'name',
      'sender_name', COALESCE(v_sender, 'A Cydex user'),
      'order_number', o.order_number,
      'code', v_code,
      'address', COALESCE(o.delivery_address ->> 'formatted_address', o.delivery_address ->> 'address'),
      'package', o.special_instructions
    ));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.email_delivery_code(UUID) FROM PUBLIC, anon, authenticated;

-- A location picked on the map plus who's there, as stored on orders
CREATE OR REPLACE FUNCTION public.delivery_point(p_location JSONB, p_name TEXT, p_phone TEXT, p_email TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'name', trim(p_name),
    'phone', trim(p_phone),
    'email', NULLIF(lower(trim(p_email)), ''),
    'address', p_location ->> 'formatted_address',
    'formatted_address', p_location ->> 'formatted_address',
    'street', COALESCE(NULLIF(p_location ->> 'place_name', ''), NULLIF(p_location ->> 'street', ''),
                       split_part(p_location ->> 'formatted_address', ',', 1)),
    'city', COALESCE(p_location ->> 'city', ''),
    'state', COALESCE(p_location ->> 'state', ''),
    'country', COALESCE(p_location ->> 'country', ''),
    'place_id', p_location ->> 'place_id',
    'additional_info', COALESCE(p_location ->> 'directions', ''),
    'latitude', (p_location ->> 'latitude')::double precision,
    'longitude', (p_location ->> 'longitude')::double precision
  ));
$$;

-- A paid delivery (rider request or Cydex Express) goes live: ready for a
-- rider, with its codes, and the recipient is emailed theirs
CREATE OR REPLACE FUNCTION public.activate_rider_request(p_order_id UUID, p_reference TEXT, p_gateway TEXT, p_details JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('cydex.order_flow', 'on', true);
  UPDATE public.orders
  SET payment_status = 'paid', payment_reference = p_reference, payment_gateway = p_gateway,
      payment_details = COALESCE(p_details, '{}'),
      status = 'ready_for_pickup', vendor_accepted_at = now(), ready_for_pickup_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_handover_codes (order_id, kind, code)
  VALUES (p_order_id, 'pickup', public.new_handover_code()),
         (p_order_id, 'delivery', public.new_handover_code())
  ON CONFLICT (order_id, kind) DO NOTHING;

  PERFORM public.email_delivery_code(p_order_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activate_rider_request(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Squad confirmed a payment (called by the squad-checkout / squad-webhook functions)
CREATE OR REPLACE FUNCTION public.confirm_order_payment(p_order_number TEXT, p_reference TEXT, p_amount NUMERIC, p_details JSONB DEFAULT '{}'::jsonb)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE order_number = p_order_number FOR UPDATE;
  IF o.id IS NULL THEN
    -- A batch of rider requests is paid for together (see the batch migration)
    RETURN public.confirm_batch_payment(p_order_number, p_reference, p_amount, p_details);
  END IF;
  IF o.payment_status IN ('paid', 'refunded') THEN
    RETURN 'already_paid';
  END IF;
  IF round(p_amount, 2) <> round(o.total_amount - o.wallet_amount, 2) THEN
    RETURN 'amount_mismatch';
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);

  IF o.order_type IN ('rider_request', 'express') AND o.status = 'pending' THEN
    PERFORM public.activate_rider_request(o.id, p_reference, 'squad', p_details);
    RETURN 'paid';
  END IF;

  UPDATE public.orders
  SET payment_status = 'paid', payment_reference = p_reference, payment_gateway = 'squad',
      payment_details = COALESCE(p_details, '{}')
  WHERE id = o.id;

  -- Paid after it was cancelled: give the money back
  IF o.status IN ('cancelled', 'rejected') THEN
    PERFORM public.refund_order(o.id);
    RETURN 'refunded';
  END IF;
  RETURN 'paid';
END;
$$;

-- Replaced by the batch migration
CREATE OR REPLACE FUNCTION public.confirm_batch_payment(p_batch_number TEXT, p_reference TEXT, p_amount NUMERIC, p_details JSONB)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT 'not_found'::text $$;

REVOKE EXECUTE ON FUNCTION public.confirm_batch_payment(TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- 2. Pricing one delivery leg (rider requests, batches, Cydex Express)
-- ===================================================================

-- p_rate: what's charged on top of the delivery fee, as a share of it
CREATE OR REPLACE FUNCTION public.delivery_leg_quote(
  p_from_latitude DOUBLE PRECISION, p_from_longitude DOUBLE PRECISION,
  p_to_latitude DOUBLE PRECISION, p_to_longitude DOUBLE PRECISION,
  p_vehicle_type TEXT, p_rate NUMERIC,
  OUT status TEXT, OUT distance_km NUMERIC, OUT vehicle_type TEXT, OUT rate_per_km NUMERIC, OUT base_rate NUMERIC,
  OUT distance_fee NUMERIC, OUT delivery_fee NUMERIC, OUT charge NUMERIC, OUT total_amount NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m DOUBLE PRECISION;
  f RECORD;
BEGIN
  IF p_from_latitude IS NULL OR p_from_longitude IS NULL OR p_to_latitude IS NULL OR p_to_longitude IS NULL THEN
    status := 'no_location';
    RETURN;
  END IF;
  v_m := public.distance_m(p_from_latitude, p_from_longitude, p_to_latitude, p_to_longitude);
  distance_km := round((v_m / 1000)::numeric, 2);
  SELECT * INTO f FROM public.delivery_fee_for(distance_km, p_vehicle_type);
  vehicle_type := f.vehicle_type;
  rate_per_km := f.rate_per_km;
  base_rate := f.base_rate;
  distance_fee := f.distance_fee;
  delivery_fee := f.delivery_fee;
  charge := round(delivery_fee * COALESCE(p_rate, 0), 2);
  total_amount := delivery_fee + charge;
  status := CASE WHEN v_m <= public.customer_vendor_radius_m() THEN 'ok' ELSE 'out_of_range' END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delivery_leg_quote(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- 3. Rider requests: recipient email and preferred delivery mode
-- ===================================================================

DROP FUNCTION IF EXISTS public.rider_request_quote(DOUBLE PRECISION, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION public.rider_request_quote(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_vehicle_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store JSONB := public.order_pickup_point(auth.uid(), NULL);
  v_rate NUMERIC;
  v_wallet NUMERIC;
  v_modes JSONB := '[]'::jsonb;
  q RECORD;
BEGIN
  SELECT COALESCE(rider_request_commission_rate, 0.10) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  SELECT COALESCE(available_balance, 0) INTO v_wallet FROM public.vendor_wallet WHERE vendor_id = auth.uid();
  v_wallet := COALESCE(v_wallet, 0);
  IF v_store IS NULL THEN
    RETURN jsonb_build_object('status', 'no_store', 'wallet_balance', v_wallet);
  END IF;

  SELECT * INTO q FROM public.delivery_leg_quote((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
                                                 p_latitude, p_longitude, p_vehicle_type, v_rate);
  IF q.status = 'no_location' THEN
    RETURN jsonb_build_object('status', 'no_location', 'wallet_balance', v_wallet);
  END IF;
  v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, q.distance_km, 0);
  -- Price for the mode they'll get (their choice if a rider with it is free)
  SELECT * INTO q FROM public.delivery_leg_quote(
    (v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, p_latitude, p_longitude,
    COALESCE(public.pick_delivery_mode(v_modes, COALESCE(p_vehicle_type, public.default_vehicle_type())), q.vehicle_type), v_rate);

  RETURN jsonb_build_object(
    'status', q.status,
    'distance_km', q.distance_km,
    'vehicle_type', q.vehicle_type,
    'rate_per_km', q.rate_per_km,
    'base_rate', q.base_rate,
    'distance_fee', q.distance_fee,
    'delivery_fee', q.delivery_fee,
    'commission', q.charge,
    'total_amount', q.total_amount,
    'wallet_balance', v_wallet,
    'wallet_amount', LEAST(v_wallet, q.total_amount),
    'card_amount', q.total_amount - LEAST(v_wallet, q.total_amount),
    'riders_available', EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean),
    'modes', v_modes,
    'eta_min', (SELECT (m ->> 'eta_min')::int FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = q.vehicle_type)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rider_request_quote(DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_request_quote(DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;

-- Checks shared by rider requests, batches and Cydex Express
CREATE OR REPLACE FUNCTION public.check_recipient(p_name TEXT, p_phone TEXT, p_email TEXT, p_location JSONB)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF NULLIF(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Enter the name of the person receiving the delivery';
  END IF;
  IF NOT public.is_valid_phone(p_phone) THEN
    RAISE EXCEPTION 'Enter a valid phone number for the person receiving the delivery';
  END IF;
  IF NOT public.is_valid_email(p_email) THEN
    RAISE EXCEPTION 'Enter a valid email for the person receiving the delivery. We send them the delivery code.';
  END IF;
  IF (p_location ->> 'latitude') IS NULL OR (p_location ->> 'longitude') IS NULL
     OR NULLIF(p_location ->> 'formatted_address', '') IS NULL THEN
    RAISE EXCEPTION 'Choose the delivery location on the map';
  END IF;
END;
$$;

-- Riders must be free near the pickup, and the chosen mode must have one
CREATE OR REPLACE FUNCTION public.require_free_rider(p_modes JSONB, p_vehicle_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_modes) m WHERE (m ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'Our service is currently unavailable because all our riders are busy at the moment. Please check again later.';
  END IF;
  IF NULLIF(trim(p_vehicle_type), '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_modes) m
                     WHERE m ->> 'key' = trim(p_vehicle_type) AND (m ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'No rider with that delivery mode is free right now. Choose another delivery mode.';
  END IF;
  RETURN public.pick_delivery_mode(p_modes, COALESCE(NULLIF(trim(p_vehicle_type), ''), public.default_vehicle_type()));
END;
$$;

DROP FUNCTION IF EXISTS public.create_rider_request(TEXT, TEXT, JSONB, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.create_rider_request(
  p_recipient_name TEXT,
  p_recipient_phone TEXT,
  p_recipient_email TEXT,
  p_location JSONB,
  p_package_details TEXT DEFAULT NULL,
  p_save_customer BOOLEAN DEFAULT false,
  p_vehicle_type TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor UUID := auth.uid();
  v_lat DOUBLE PRECISION := (p_location ->> 'latitude')::double precision;
  v_lng DOUBLE PRECISION := (p_location ->> 'longitude')::double precision;
  v_store JSONB := public.order_pickup_point(auth.uid(), NULL);
  v_rate NUMERIC;
  v_mode TEXT;
  q RECORD;
  v_wallet NUMERIC;
  v_order public.orders%ROWTYPE;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'vendor' THEN
    RAISE EXCEPTION 'Only vendors can request a rider';
  END IF;
  IF NOT public.vendor_can_trade(v_vendor) THEN
    RAISE EXCEPTION 'Your store isn''t active yet. Finish onboarding or wait for verification.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_vendor AND public.is_valid_phone(phone)) THEN
    RAISE EXCEPTION 'Add a phone number to your profile before requesting a rider';
  END IF;
  PERFORM public.check_recipient(p_recipient_name, p_recipient_phone, p_recipient_email, p_location);
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'Set your store location in Settings before requesting a rider';
  END IF;

  SELECT COALESCE(rider_request_commission_rate, 0.10) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  v_mode := public.require_free_rider(
    public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, 0, 0), p_vehicle_type);
  SELECT * INTO q FROM public.delivery_leg_quote((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
                                                 v_lat, v_lng, v_mode, v_rate);
  IF q.status = 'out_of_range' THEN
    RAISE EXCEPTION 'The delivery location is more than 5 km from your store';
  END IF;

  -- Wallet first
  SELECT available_balance INTO v_wallet FROM public.vendor_wallet WHERE vendor_id = v_vendor FOR UPDATE;
  v_wallet := LEAST(COALESCE(v_wallet, 0), q.total_amount);

  INSERT INTO public.orders (
    order_type, customer_id, vendor_id, status, payment_status, delivery_type,
    delivery_address, subtotal, delivery_fee, service_charge, total_amount,
    distance_km, base_rate, distance_fee, wallet_amount, special_instructions,
    preferred_vehicle_type, vehicle_rate_per_km
  ) VALUES (
    'rider_request', NULL, v_vendor, 'pending', 'pending', 'standard',
    public.delivery_point(p_location, p_recipient_name, p_recipient_phone, p_recipient_email),
    0, q.delivery_fee, q.charge, q.total_amount,
    q.distance_km, q.base_rate, q.distance_fee, v_wallet, NULLIF(trim(p_package_details), ''),
    q.vehicle_type, q.rate_per_km
  )
  RETURNING * INTO v_order;

  IF v_wallet > 0 THEN
    UPDATE public.vendor_wallet SET available_balance = available_balance - v_wallet, updated_at = now()
    WHERE vendor_id = v_vendor;
    INSERT INTO public.vendor_transactions (
      vendor_id, transaction_id, type, amount, fee, net_amount, status, description,
      reference_id, reference_type, processed_at, metadata
    ) VALUES (
      v_vendor, 'RRQ-' || v_order.order_number, 'adjustment', v_wallet, 0, -v_wallet, 'completed',
      'Rider request ' || v_order.order_number || ' paid from wallet', v_order.id, 'order', now(),
      jsonb_build_object('order_number', v_order.order_number)
    );
  END IF;

  IF p_save_customer THEN
    INSERT INTO public.vendor_customers (
      vendor_id, name, phone, email, place_name, formatted_address, street, city, state, country,
      place_id, latitude, longitude, directions
    ) VALUES (
      v_vendor, trim(p_recipient_name), trim(p_recipient_phone), lower(trim(p_recipient_email)), p_location ->> 'place_name',
      p_location ->> 'formatted_address', p_location ->> 'street', p_location ->> 'city',
      p_location ->> 'state', p_location ->> 'country', p_location ->> 'place_id', v_lat, v_lng,
      NULLIF(p_location ->> 'directions', '')
    );
  END IF;

  -- Fully covered by the wallet: live now
  IF v_wallet >= q.total_amount THEN
    PERFORM public.activate_rider_request(v_order.id, 'WALLET-' || v_order.order_number, 'wallet', '{}');
    SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  END IF;

  RETURN v_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_rider_request(TEXT, TEXT, TEXT, JSONB, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rider_request(TEXT, TEXT, TEXT, JSONB, TEXT, BOOLEAN, TEXT) TO authenticated;

-- ===================================================================
-- 4. Cydex Express
-- ===================================================================

-- p_pickup / p_dropoff: locations picked on the map (latitude, longitude, formatted_address, ...)
CREATE OR REPLACE FUNCTION public.express_quote(
  p_pickup JSONB,
  p_dropoff JSONB,
  p_vehicle_type TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate NUMERIC;
  v_wallet NUMERIC;
  v_modes JSONB := '[]'::jsonb;
  v_plat DOUBLE PRECISION := (p_pickup ->> 'latitude')::float8;
  v_plng DOUBLE PRECISION := (p_pickup ->> 'longitude')::float8;
  q RECORD;
  d RECORD;
  v_total NUMERIC;
BEGIN
  SELECT COALESCE(service_charge_rate, 0.15) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  SELECT COALESCE(available_balance, 0) INTO v_wallet FROM public.customer_wallet WHERE customer_id = auth.uid();
  v_wallet := COALESCE(v_wallet, 0);

  SELECT * INTO q FROM public.delivery_leg_quote(v_plat, v_plng, (p_dropoff ->> 'latitude')::float8,
                                                 (p_dropoff ->> 'longitude')::float8, p_vehicle_type, v_rate);
  IF q.status = 'no_location' THEN
    RETURN jsonb_build_object('status', 'no_location', 'wallet_balance', v_wallet);
  END IF;
  v_modes := public.delivery_modes(v_plat, v_plng, q.distance_km, 0);
  SELECT * INTO q FROM public.delivery_leg_quote(
    v_plat, v_plng, (p_dropoff ->> 'latitude')::float8, (p_dropoff ->> 'longitude')::float8,
    COALESCE(public.pick_delivery_mode(v_modes, COALESCE(p_vehicle_type, public.default_vehicle_type())), q.vehicle_type), v_rate);

  SELECT * INTO d FROM public.apply_promotion('express', NULL, 0, q.delivery_fee, q.charge, q.distance_km, q.vehicle_type, p_coupon_code);
  v_total := GREATEST(q.total_amount - COALESCE(d.discount_amount, 0), 0);

  RETURN jsonb_build_object(
    'status', q.status,
    'distance_km', q.distance_km,
    'vehicle_type', q.vehicle_type,
    'rate_per_km', q.rate_per_km,
    'base_rate', q.base_rate,
    'distance_fee', q.distance_fee,
    'delivery_fee', q.delivery_fee,
    'service_charge', q.charge,
    'discount_amount', COALESCE(d.discount_amount, 0),
    'discount_target', d.discount_target,
    'promotion_name', d.promotion_name,
    'coupon_status', d.coupon_status,
    'total_amount', v_total,
    'wallet_balance', v_wallet,
    'wallet_amount', LEAST(v_wallet, v_total),
    'card_amount', v_total - LEAST(v_wallet, v_total),
    'riders_available', EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean),
    'modes', v_modes,
    'eta_min', (SELECT (m ->> 'eta_min')::int FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = q.vehicle_type)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.express_quote(JSONB, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.express_quote(JSONB, JSONB, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_express_order(
  p_pickup JSONB,
  p_dropoff JSONB,
  p_recipient_name TEXT,
  p_recipient_phone TEXT,
  p_recipient_email TEXT,
  p_package_details TEXT,
  p_vehicle_type TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer UUID := auth.uid();
  v_me public.profiles%ROWTYPE;
  v_plat DOUBLE PRECISION := (p_pickup ->> 'latitude')::float8;
  v_plng DOUBLE PRECISION := (p_pickup ->> 'longitude')::float8;
  v_rate NUMERIC;
  v_mode TEXT;
  q RECORD;
  d RECORD;
  v_total NUMERIC;
  v_paid NUMERIC;
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_me FROM public.profiles WHERE id = v_customer;
  IF v_me.id IS NULL OR lower(v_me.role) <> 'customer' THEN
    RAISE EXCEPTION 'Log in as a customer to use Cydex Express';
  END IF;
  IF NOT public.is_valid_phone(v_me.phone) THEN
    RAISE EXCEPTION 'Add a phone number to your profile first, so the rider can reach you at pickup';
  END IF;
  IF v_plat IS NULL OR v_plng IS NULL OR NULLIF(p_pickup ->> 'formatted_address', '') IS NULL THEN
    RAISE EXCEPTION 'Choose the pickup location on the map';
  END IF;
  PERFORM public.check_recipient(p_recipient_name, p_recipient_phone, p_recipient_email, p_dropoff);
  IF NULLIF(trim(p_package_details), '') IS NULL THEN
    RAISE EXCEPTION 'Describe what you''re sending';
  END IF;

  SELECT COALESCE(service_charge_rate, 0.15) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  v_mode := public.require_free_rider(public.delivery_modes(v_plat, v_plng, 0, 0), p_vehicle_type);
  SELECT * INTO q FROM public.delivery_leg_quote(v_plat, v_plng, (p_dropoff ->> 'latitude')::float8,
                                                 (p_dropoff ->> 'longitude')::float8, v_mode, v_rate);
  IF q.status = 'out_of_range' THEN
    RAISE EXCEPTION 'The drop-off is more than 5 km from the pickup point';
  END IF;

  SELECT * INTO d FROM public.apply_promotion('express', NULL, 0, q.delivery_fee, q.charge, q.distance_km, q.vehicle_type, p_coupon_code);
  IF d.coupon_status = 'invalid' THEN
    RAISE EXCEPTION 'That coupon code isn''t valid for this delivery';
  END IF;
  v_total := GREATEST(q.total_amount - COALESCE(d.discount_amount, 0), 0);

  INSERT INTO public.orders (
    order_type, customer_id, vendor_id, status, payment_status, delivery_type,
    pickup_address, delivery_address, subtotal, delivery_fee, service_charge, total_amount,
    distance_km, base_rate, distance_fee, special_instructions, preferred_vehicle_type, vehicle_rate_per_km,
    promotion_id, coupon_code, discount_amount, discount_target, discount_bearer
  ) VALUES (
    'express', v_customer, NULL, 'pending', 'pending', 'standard',
    public.delivery_point(p_pickup, v_me.name, v_me.phone),
    public.delivery_point(p_dropoff, p_recipient_name, p_recipient_phone, p_recipient_email),
    0, q.delivery_fee, q.charge, v_total,
    q.distance_km, q.base_rate, q.distance_fee, trim(p_package_details), q.vehicle_type, q.rate_per_km,
    d.promotion_id, CASE WHEN d.coupon_status = 'applied' THEN upper(trim(p_coupon_code)) END,
    COALESCE(d.discount_amount, 0), d.discount_target, d.discount_bearer
  )
  RETURNING * INTO v_order;

  v_paid := public.pay_order_from_customer_wallet(v_order.id);
  IF v_paid >= v_order.total_amount THEN
    PERFORM public.activate_rider_request(v_order.id, 'WALLET-' || v_order.order_number, 'wallet', '{}');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  RETURN v_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_express_order(JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_express_order(JSONB, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Sender: enter the rider's pickup code to hand the item over
CREATE OR REPLACE FUNCTION public.sender_confirm_pickup(p_order_id UUID, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'customer');
BEGIN
  IF o.order_type <> 'express' THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.status NOT IN ('rider_assigned', 'picking_up') THEN
    RAISE EXCEPTION 'This delivery isn''t waiting for a rider to collect it';
  END IF;
  IF NOT public.check_handover_code(o.id, 'pickup', p_code) THEN
    RETURN false;
  END IF;
  PERFORM public.mark_picked_up(o);
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sender_confirm_pickup(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sender_confirm_pickup(UUID, TEXT) TO authenticated;

-- Customers cancel an order before the vendor accepts it, and a Cydex
-- Express delivery until a rider accepts it
CREATE OR REPLACE FUNCTION public.customer_cancel_order(p_order_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'customer');
BEGIN
  IF o.order_type = 'express' THEN
    IF o.status NOT IN ('pending', 'ready_for_pickup') OR o.rider_id IS NOT NULL THEN
      RAISE EXCEPTION 'Deliveries can only be cancelled before a rider accepts them';
    END IF;
  ELSIF o.status <> 'pending' THEN
    RAISE EXCEPTION 'Orders can only be cancelled before the vendor accepts them';
  END IF;

  UPDATE public.orders
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = NULLIF(trim(p_reason), '')
  WHERE id = o.id;
  UPDATE public.deliveries SET status = 'cancelled', cancelled_at = now()
  WHERE order_id = o.id AND status = 'available';

  PERFORM public.refund_order(o.id);
END;
$$;

-- ===================================================================
-- 5. Admin order page: a Cydex Express order's pickup point
--    (same function as before with pickup_address added)
-- ===================================================================

CREATE OR REPLACE FUNCTION public.admin_order_detail(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders%ROWTYPE;
  v JSONB;
BEGIN
  PERFORM public.require_admin();
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT jsonb_build_object(
    'order', to_jsonb(o) - 'verification_code',
    'customer', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'phone', p.phone, 'status', p.status)
                 FROM public.profiles p WHERE p.id = o.customer_id),
    'vendor', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'phone', p.phone,
                 'verification_status', (SELECT status FROM public.verifications WHERE profile_id = p.id))
               FROM public.profiles p WHERE p.id = o.vendor_id),
    'rider', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'phone', p.phone,
                'vehicle_type', rp.vehicle_type, 'rating', rp.rating, 'rider_status', rp.rider_status)
              FROM public.profiles p LEFT JOIN public.rider_profiles rp ON rp.id = p.id WHERE p.id = o.rider_id),
    'pickup', COALESCE(
      (SELECT d.pickup_location FROM public.deliveries d WHERE d.order_id = o.id AND d.pickup_location IS NOT NULL LIMIT 1),
      o.pickup_address,
      (SELECT to_jsonb(a) - 'profile_id' FROM public.addresses a WHERE a.profile_id = o.vendor_id
       ORDER BY a.is_default DESC NULLS LAST, a.created_at LIMIT 1)),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', i.product_name, 'quantity', i.quantity,
                         'unit_price', i.unit_price, 'total_price', i.total_price) ORDER BY i.created_at)
                       FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb),
    'hold', (SELECT jsonb_build_object('status', h.status, 'total_amount', h.total_amount, 'vendor_amount', h.vendor_amount,
               'rider_amount', h.rider_amount, 'platform_fee', h.platform_fee, 'created_at', h.created_at,
               'vendor_released_at', h.vendor_released_at, 'rider_released_at', h.rider_released_at)
             FROM public.payment_holds h WHERE h.order_id = o.id),
    'split', (SELECT to_jsonb(m) - 'order_id' - 'customer_id' - 'vendor_id' - 'rider_id'
              FROM public.order_money_split m WHERE m.order_id = o.id),
    'codes', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', c.kind, 'failed_attempts', c.failed_attempts,
                         'used_at', c.used_at, 'created_at', c.created_at, 'locked', c.failed_attempts >= 5 AND c.used_at IS NULL)
                         ORDER BY c.kind DESC)
                       FROM public.order_handover_codes c WHERE c.order_id = o.id), '[]'::jsonb),
    'delivery', (SELECT jsonb_build_object('status', d.status, 'accepted_at', d.accepted_at, 'picking_up_at', d.picking_up_at,
                   'picked_up_at', d.picked_up_at, 'delivered_at', d.delivered_at, 'cancelled_at', d.cancelled_at,
                   'rider_earning', d.rider_earning)
                 FROM public.deliveries d WHERE d.order_id = o.id ORDER BY d.created_at DESC LIMIT 1),
    'transactions', COALESCE((SELECT jsonb_agg(t ORDER BY t->>'created_at') FROM (
        SELECT jsonb_build_object('who', 'customer', 'type', type, 'amount', amount, 'status', status, 'description', description, 'created_at', created_at) t
        FROM public.customer_transactions WHERE reference_id = o.id
        UNION ALL
        SELECT jsonb_build_object('who', 'vendor', 'type', type, 'amount', COALESCE(net_amount, amount), 'status', status, 'description', description, 'created_at', created_at)
        FROM public.vendor_transactions WHERE reference_id = o.id
        UNION ALL
        SELECT jsonb_build_object('who', 'rider', 'type', type, 'amount', COALESCE(net_amount, amount), 'status', status, 'description', description, 'created_at', created_at)
        FROM public.rider_transactions WHERE reference_id = o.id
      ) x), '[]'::jsonb),
    'ratings', jsonb_build_object(
      'vendor', (SELECT jsonb_build_object('rating', r.rating, 'feedback', r.feedback, 'hidden_at', r.hidden_at)
                 FROM public.vendor_ratings r WHERE r.order_id = o.id LIMIT 1),
      'rider', (SELECT jsonb_build_object('rating', r.rating, 'feedback', r.feedback, 'hidden_at', r.hidden_at)
                FROM public.rider_ratings r WHERE r.order_id = o.id LIMIT 1)),
    'admin_actions', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', l.action, 'admin', a.name, 'details', l.new_values,
                                 'created_at', l.created_at) ORDER BY l.created_at)
                               FROM public.audit_logs l LEFT JOIN public.profiles a ON a.id = l.admin_id
                               WHERE l.target_type = 'order' AND l.target_id = o.id::text), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$function$;
