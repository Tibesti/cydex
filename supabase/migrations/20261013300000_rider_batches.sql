-- ===================================================================
-- Batch rider requests
--   A vendor sends several deliveries with one rider. Each stop is its own
--   rider request (orders.batch_id / batch_seq) with its own recipient,
--   price and delivery code. Stops are priced separately, each from the
--   stop before it: store -> stop 1 -> stop 2 -> ... The vendor pays for the
--   batch in one go (wallet first, then one Squad payment against the batch
--   number). One rider accepts the whole batch and collects it with a
--   single pickup code (see rider_accept_order / vendor_confirm_pickup).
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.rider_request_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT NOT NULL UNIQUE,
  vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rider_request_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendors see their batches" ON public.rider_request_batches
  FOR SELECT USING (vendor_id = auth.uid());
CREATE POLICY "Admins manage batches" ON public.rider_request_batches
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.app_config (key, value) VALUES ('batch_max_stops', '5')
ON CONFLICT (key) DO NOTHING;

-- Prices a batch: one leg per stop, each from the stop before it
-- p_stops: [{"latitude": .., "longitude": ..}, ...] in delivery order
CREATE OR REPLACE FUNCTION public.batch_quote(p_stops JSONB, p_vehicle_type TEXT DEFAULT NULL)
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
  v_modes JSONB;
  v_mode TEXT;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_stop JSONB;
  v_legs JSONB := '[]'::jsonb;
  v_status TEXT := 'ok';
  v_km NUMERIC := 0;
  v_fee NUMERIC := 0;
  v_commission NUMERIC := 0;
  v_count INTEGER := COALESCE(jsonb_array_length(p_stops), 0);
  v_base NUMERIC;
  q RECORD;
BEGIN
  SELECT COALESCE(rider_request_commission_rate, 0.10) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  SELECT COALESCE(available_balance, 0) INTO v_wallet FROM public.vendor_wallet WHERE vendor_id = auth.uid();
  v_wallet := COALESCE(v_wallet, 0);
  IF v_store IS NULL THEN
    RETURN jsonb_build_object('status', 'no_store', 'wallet_balance', v_wallet);
  END IF;

  v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, 0, 0);
  v_mode := COALESCE(public.pick_delivery_mode(v_modes, COALESCE(p_vehicle_type, public.default_vehicle_type())),
                     p_vehicle_type, public.default_vehicle_type());

  v_lat := (v_store ->> 'latitude')::float8;
  v_lng := (v_store ->> 'longitude')::float8;
  FOR v_stop IN SELECT value FROM jsonb_array_elements(COALESCE(p_stops, '[]'::jsonb)) LOOP
    SELECT * INTO q FROM public.delivery_leg_quote(v_lat, v_lng, (v_stop ->> 'latitude')::float8,
                                                   (v_stop ->> 'longitude')::float8, v_mode, v_rate);
    v_legs := v_legs || jsonb_build_object(
      'status', q.status, 'distance_km', q.distance_km, 'delivery_fee', q.delivery_fee,
      'commission', q.charge, 'total_amount', q.total_amount);
    IF q.status <> 'ok' AND v_status = 'ok' THEN
      v_status := q.status;
    END IF;
    IF q.status <> 'no_location' THEN
      v_km := v_km + q.distance_km;
      v_fee := v_fee + q.delivery_fee;
      v_commission := v_commission + q.charge;
      v_lat := (v_stop ->> 'latitude')::float8;
      v_lng := (v_stop ->> 'longitude')::float8;
    END IF;
  END LOOP;

  -- What the whole batch would cost by each mode, and how long the route takes
  SELECT COALESCE(base_rate, 500) INTO v_base FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  SELECT COALESCE(jsonb_agg(m || jsonb_build_object(
           'delivery_fee', round(v_km * (m ->> 'rate_per_km')::numeric, 2) + v_count * COALESCE(v_base, 500),
           'eta_min', (SELECT eta_min FROM public.delivery_eta(m ->> 'key', v_km, 0)),
           'eta_max', (SELECT eta_max FROM public.delivery_eta(m ->> 'key', v_km, 0)))), '[]'::jsonb)
  INTO v_modes FROM jsonb_array_elements(v_modes) m;

  RETURN jsonb_build_object(
    'status', v_status,
    'vehicle_type', v_mode,
    'stops', v_legs,
    'distance_km', v_km,
    'delivery_fee', v_fee,
    'commission', v_commission,
    'total_amount', v_fee + v_commission,
    'wallet_balance', v_wallet,
    'wallet_amount', LEAST(v_wallet, v_fee + v_commission),
    'card_amount', v_fee + v_commission - LEAST(v_wallet, v_fee + v_commission),
    'riders_available', EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean),
    'modes', v_modes,
    'max_stops', (SELECT COALESCE(NULLIF(value, '')::int, 5) FROM public.app_config WHERE key = 'batch_max_stops')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.batch_quote(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_quote(JSONB, TEXT) TO authenticated;

-- What's still to pay by card for a batch
CREATE OR REPLACE FUNCTION public.batch_amount_due(p_batch_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(total_amount - wallet_amount), 0)
  FROM public.orders
  WHERE batch_id = p_batch_id AND status = 'pending' AND payment_status IN ('pending', 'failed');
$$;

REVOKE EXECUTE ON FUNCTION public.batch_amount_due(UUID) FROM PUBLIC, anon, authenticated;

-- p_stops: [{"name", "phone", "email", "location": {...}, "package_details", "save_customer"}, ...]
-- Returns {batch_id, batch_number, order_ids, total_amount, wallet_amount, card_amount, paid}
CREATE OR REPLACE FUNCTION public.create_rider_batch(p_stops JSONB, p_vehicle_type TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor UUID := auth.uid();
  v_store JSONB := public.order_pickup_point(auth.uid(), NULL);
  v_count INTEGER := CASE WHEN jsonb_typeof(p_stops) = 'array' THEN jsonb_array_length(p_stops) ELSE 0 END;
  v_max INTEGER;
  v_rate NUMERIC;
  v_mode TEXT;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
  v_stop JSONB;
  v_loc JSONB;
  v_seq INTEGER := 0;
  v_balance NUMERIC;
  v_take NUMERIC;
  v_wallet_used NUMERIC := 0;
  v_total NUMERIC := 0;
  v_batch public.rider_request_batches%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_ids UUID[] := '{}';
  q RECORD;
  r RECORD;
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
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'Set your store location in Settings before requesting a rider';
  END IF;
  SELECT COALESCE(NULLIF(value, '')::int, 5) INTO v_max FROM public.app_config WHERE key = 'batch_max_stops';
  IF v_count < 2 THEN
    RAISE EXCEPTION 'A batch needs at least 2 drop-offs';
  END IF;
  IF v_count > COALESCE(v_max, 5) THEN
    RAISE EXCEPTION 'A batch can have up to % drop-offs', COALESCE(v_max, 5);
  END IF;

  SELECT COALESCE(rider_request_commission_rate, 0.10) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  v_mode := public.require_free_rider(
    public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, 0, 0), p_vehicle_type);

  INSERT INTO public.rider_request_batches (batch_number, vendor_id, vehicle_type)
  VALUES ('BAT-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)), v_vendor, v_mode)
  RETURNING * INTO v_batch;

  SELECT available_balance INTO v_balance FROM public.vendor_wallet WHERE vendor_id = v_vendor FOR UPDATE;
  v_balance := COALESCE(v_balance, 0);

  v_lat := (v_store ->> 'latitude')::float8;
  v_lng := (v_store ->> 'longitude')::float8;
  FOR v_stop IN SELECT value FROM jsonb_array_elements(p_stops) LOOP
    v_seq := v_seq + 1;
    v_loc := v_stop -> 'location';
    BEGIN
      PERFORM public.check_recipient(v_stop ->> 'name', v_stop ->> 'phone', v_stop ->> 'email', v_loc);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Drop-off %: %', v_seq, SQLERRM;
    END;

    SELECT * INTO q FROM public.delivery_leg_quote(v_lat, v_lng, (v_loc ->> 'latitude')::float8,
                                                   (v_loc ->> 'longitude')::float8, v_mode, v_rate);
    IF q.status = 'out_of_range' THEN
      RAISE EXCEPTION 'Drop-off % is more than 5 km from %', v_seq,
        CASE WHEN v_seq = 1 THEN 'your store' ELSE 'drop-off ' || (v_seq - 1) END;
    END IF;

    v_take := LEAST(v_balance - v_wallet_used, q.total_amount);
    INSERT INTO public.orders (
      order_type, customer_id, vendor_id, status, payment_status, delivery_type,
      delivery_address, subtotal, delivery_fee, service_charge, total_amount,
      distance_km, base_rate, distance_fee, wallet_amount, special_instructions,
      preferred_vehicle_type, vehicle_rate_per_km, batch_id, batch_seq
    ) VALUES (
      'rider_request', NULL, v_vendor, 'pending', 'pending', 'standard',
      public.delivery_point(v_loc, v_stop ->> 'name', v_stop ->> 'phone', v_stop ->> 'email'),
      0, q.delivery_fee, q.charge, q.total_amount,
      q.distance_km, q.base_rate, q.distance_fee, v_take, NULLIF(trim(v_stop ->> 'package_details'), ''),
      q.vehicle_type, q.rate_per_km, v_batch.id, v_seq
    )
    RETURNING * INTO v_order;
    v_ids := v_ids || v_order.id;
    v_wallet_used := v_wallet_used + v_take;
    v_total := v_total + q.total_amount;

    IF COALESCE((v_stop ->> 'save_customer')::boolean, false) THEN
      INSERT INTO public.vendor_customers (
        vendor_id, name, phone, email, place_name, formatted_address, street, city, state, country,
        place_id, latitude, longitude, directions
      ) VALUES (
        v_vendor, trim(v_stop ->> 'name'), trim(v_stop ->> 'phone'), lower(trim(v_stop ->> 'email')), v_loc ->> 'place_name',
        v_loc ->> 'formatted_address', v_loc ->> 'street', v_loc ->> 'city', v_loc ->> 'state', v_loc ->> 'country',
        v_loc ->> 'place_id', (v_loc ->> 'latitude')::float8, (v_loc ->> 'longitude')::float8,
        NULLIF(v_loc ->> 'directions', '')
      );
    END IF;

    v_lat := (v_loc ->> 'latitude')::float8;
    v_lng := (v_loc ->> 'longitude')::float8;
  END LOOP;

  IF v_wallet_used > 0 THEN
    UPDATE public.vendor_wallet SET available_balance = available_balance - v_wallet_used, updated_at = now()
    WHERE vendor_id = v_vendor;
    INSERT INTO public.vendor_transactions (
      vendor_id, transaction_id, type, amount, fee, net_amount, status, description,
      reference_id, reference_type, processed_at, metadata
    ) VALUES (
      v_vendor, 'RRQ-' || v_batch.batch_number, 'adjustment', v_wallet_used, 0, -v_wallet_used, 'completed',
      'Batch ' || v_batch.batch_number || ' (' || v_count || ' deliveries) paid from wallet', v_ids[1], 'order', now(),
      jsonb_build_object('batch_number', v_batch.batch_number)
    );
  END IF;

  -- Fully covered by the wallet: live now (last stop first, so riders get one
  -- alert, from stop 1, once every stop is ready)
  IF v_wallet_used >= v_total THEN
    FOR r IN SELECT id, order_number FROM public.orders WHERE batch_id = v_batch.id ORDER BY batch_seq DESC LOOP
      PERFORM public.activate_rider_request(r.id, 'WALLET-' || v_batch.batch_number, 'wallet', '{}');
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch.id,
    'batch_number', v_batch.batch_number,
    'order_ids', to_jsonb(v_ids),
    'total_amount', v_total,
    'wallet_amount', v_wallet_used,
    'card_amount', v_total - v_wallet_used,
    'paid', v_wallet_used >= v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_rider_batch(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rider_batch(JSONB, TEXT) TO authenticated;

-- Squad confirmed the card payment for a batch (reference carries the batch number)
CREATE OR REPLACE FUNCTION public.confirm_batch_payment(p_batch_number TEXT, p_reference TEXT, p_amount NUMERIC, p_details JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.rider_request_batches%ROWTYPE;
  v_due NUMERIC;
  r RECORD;
BEGIN
  SELECT * INTO b FROM public.rider_request_batches WHERE batch_number = p_batch_number FOR UPDATE;
  IF b.id IS NULL THEN
    RETURN 'not_found';
  END IF;
  PERFORM 1 FROM public.orders WHERE batch_id = b.id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE batch_id = b.id AND status = 'pending' AND payment_status IN ('pending', 'failed')) THEN
    RETURN CASE WHEN EXISTS (SELECT 1 FROM public.orders WHERE batch_id = b.id AND payment_status IN ('paid', 'refunded'))
                THEN 'already_paid' ELSE 'not_found' END;
  END IF;
  v_due := public.batch_amount_due(b.id);
  IF round(p_amount, 2) <> round(v_due, 2) THEN
    RETURN 'amount_mismatch';
  END IF;

  FOR r IN SELECT id FROM public.orders
           WHERE batch_id = b.id AND status = 'pending' AND payment_status IN ('pending', 'failed')
           ORDER BY batch_seq DESC LOOP
    PERFORM public.activate_rider_request(r.id, p_reference, 'squad', p_details);
  END LOOP;
  RETURN 'paid';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_batch_payment(TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC, anon, authenticated;

-- Vendor: cancel every stop of a batch that no rider has accepted yet
CREATE OR REPLACE FUNCTION public.cancel_rider_batch(p_batch_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rider_request_batches WHERE id = p_batch_id AND vendor_id = auth.uid()) THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;
  FOR r IN SELECT id FROM public.orders
           WHERE batch_id = p_batch_id AND status IN ('pending', 'ready_for_pickup') AND rider_id IS NULL
           ORDER BY batch_seq LOOP
    PERFORM public.cancel_rider_request(r.id);
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Batches can only be cancelled before a rider accepts them';
  END IF;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_rider_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_rider_batch(UUID) TO authenticated;
