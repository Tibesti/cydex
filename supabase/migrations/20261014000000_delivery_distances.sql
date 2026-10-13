-- How far each delivery mode goes
--
-- Until now every delivery was capped at 5 km, whatever the rider's vehicle.
-- Each vehicle type now has its own longest trip (pickup to drop-off), set by
-- the admin in Admin -> Riders & vehicles:
--   * customers see vendors as far as the longest active mode reaches
--   * a delivery mode can only be chosen when it covers the trip
--   * riders only see (and can only accept) orders their vehicle covers
-- A rider still has to be within rider_order_radius_m() (5 km) of the pickup.

ALTER TABLE public.vehicle_types
  ADD COLUMN IF NOT EXISTS max_distance_km NUMERIC(6,2) NOT NULL DEFAULT 5
  CHECK (max_distance_km > 0 AND max_distance_km <= 100);

-- The longest delivery Cydex does: the furthest any active mode goes.
-- (Was a fixed 5 km. Still used for "vendors near me" and the out-of-range check.)
CREATE OR REPLACE FUNCTION public.customer_vendor_radius_m()
RETURNS DOUBLE PRECISION
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT max(max_distance_km) FROM public.vehicle_types WHERE is_active), 5)::double precision * 1000;
$$;

-- The same in km, written without trailing zeros ("7", "1.5"), for messages and the app
CREATE OR REPLACE FUNCTION public.max_trip_km()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.customer_vendor_radius_m() / 1000)::numeric;
$$;
GRANT EXECUTE ON FUNCTION public.max_trip_km() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.km_text(p_km NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(trailing '.' FROM trim(trailing '0' FROM round(p_km, 2)::text)) || ' km';
$$;

-- The trip a rider must be able to cover: the order's own distance, or the
-- longest leg when it's part of a batch (one rider takes every drop-off)
CREATE OR REPLACE FUNCTION public.order_trip_km(p_distance_km NUMERIC, p_batch_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN p_batch_id IS NULL THEN COALESCE(p_distance_km, 0)
              ELSE COALESCE((SELECT max(distance_km) FROM public.orders WHERE batch_id = p_batch_id), p_distance_km, 0) END;
$$;

-- The longest leg of a route: from the start to the first point, then point to point
CREATE OR REPLACE FUNCTION public.longest_leg_km(p_latitude DOUBLE PRECISION, p_longitude DOUBLE PRECISION, p_points JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lat DOUBLE PRECISION := p_latitude;
  v_lng DOUBLE PRECISION := p_longitude;
  v_point JSONB;
  v_longest NUMERIC := 0;
BEGIN
  FOR v_point IN SELECT value FROM jsonb_array_elements(COALESCE(p_points, '[]'::jsonb)) LOOP
    CONTINUE WHEN (v_point ->> 'latitude') IS NULL OR (v_point ->> 'longitude') IS NULL;
    v_longest := GREATEST(v_longest, round((public.distance_m(v_lat, v_lng, (v_point ->> 'latitude')::float8,
                                                              (v_point ->> 'longitude')::float8) / 1000)::numeric, 2));
    v_lat := (v_point ->> 'latitude')::float8;
    v_lng := (v_point ->> 'longitude')::float8;
  END LOOP;
  RETURN v_longest;
END;
$$;

-- The delivery modes for a trip. A mode is available when a rider using it is
-- free near the pickup AND the mode covers the distance.
CREATE OR REPLACE FUNCTION public.delivery_modes(
  p_pickup_latitude DOUBLE PRECISION,
  p_pickup_longitude DOUBLE PRECISION,
  p_distance_km NUMERIC,
  p_prep_minutes INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key', t.key,
    'label', COALESCE(t.customer_label, t.name),
    'riders', COALESCE(r.riders, 0),
    'max_distance_km', t.max_distance_km,
    'in_range', COALESCE(p_distance_km, 0) <= t.max_distance_km,
    'available', COALESCE(r.riders, 0) > 0 AND COALESCE(p_distance_km, 0) <= t.max_distance_km,
    'rate_per_km', t.rate_per_km,
    'delivery_fee', f.delivery_fee,
    'eta_min', e.eta_min,
    'eta_max', e.eta_max
  ) ORDER BY t.sort_order, t.key), '[]'::jsonb)
  FROM public.vehicle_types t
  LEFT JOIN public.free_riders_near(p_pickup_latitude, p_pickup_longitude) r ON r.vehicle_type = t.key
  CROSS JOIN LATERAL public.delivery_fee_for(p_distance_km, t.key) f
  CROSS JOIN LATERAL public.delivery_eta(t.key, p_distance_km, p_prep_minutes) e
  WHERE t.is_active;
$$;

-- Picks the delivery mode for a new delivery, or says why there isn't one
CREATE OR REPLACE FUNCTION public.require_free_rider(p_modes JSONB, p_vehicle_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_wanted TEXT := NULLIF(trim(p_vehicle_type), '');
BEGIN
  IF jsonb_array_length(p_modes) > 0
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_modes) m WHERE COALESCE((m ->> 'in_range')::boolean, true)) THEN
    RAISE EXCEPTION 'That''s too far for us to deliver. The longest delivery we do is %.', public.km_text(public.max_trip_km());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_modes) m WHERE (m ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'Our service is currently unavailable because all our riders are busy at the moment. Please check again later.';
  END IF;
  IF v_wanted IS NOT NULL
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_modes) m
                 WHERE m ->> 'key' = v_wanted AND NOT COALESCE((m ->> 'in_range')::boolean, true)) THEN
    RAISE EXCEPTION 'That delivery mode doesn''t go this far. Choose another delivery mode.';
  END IF;
  IF v_wanted IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_modes) m
                     WHERE m ->> 'key' = v_wanted AND (m ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'No rider with that delivery mode is free right now. Choose another delivery mode.';
  END IF;
  RETURN public.pick_delivery_mode(p_modes, COALESCE(v_wanted, public.default_vehicle_type()));
END;
$$;

-- Admin: add or edit a vehicle type, now with how far it goes
DROP FUNCTION IF EXISTS public.admin_save_vehicle_type(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN, BOOLEAN);
CREATE OR REPLACE FUNCTION public.admin_save_vehicle_type(
  p_name TEXT,
  p_rate_per_km NUMERIC,
  p_avg_speed_kmh NUMERIC,
  p_max_distance_km NUMERIC,
  p_key TEXT DEFAULT NULL,
  p_customer_label TEXT DEFAULT NULL,
  p_needs_details BOOLEAN DEFAULT true,
  p_needs_registration BOOLEAN DEFAULT false,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT := NULLIF(trim(p_name), '');
  v_key TEXT := NULLIF(trim(p_key), '');
  v_old JSONB;
BEGIN
  PERFORM public.require_admin();
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Enter the vehicle type''s name';
  END IF;
  IF p_rate_per_km IS NULL OR p_rate_per_km < 0 OR p_rate_per_km > 100000 THEN
    RAISE EXCEPTION 'Price per km must be between ₦0 and ₦100,000';
  END IF;
  IF p_avg_speed_kmh IS NULL OR p_avg_speed_kmh <= 0 OR p_avg_speed_kmh > 200 THEN
    RAISE EXCEPTION 'Average speed must be between 1 and 200 km/h';
  END IF;
  IF p_max_distance_km IS NULL OR p_max_distance_km <= 0 OR p_max_distance_km > 100 THEN
    RAISE EXCEPTION 'The longest trip must be between 0.1 and 100 km';
  END IF;

  IF v_key IS NULL THEN
    v_key := trim(both '_' from regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'));
    IF v_key = '' OR EXISTS (SELECT 1 FROM public.vehicle_types WHERE key = v_key OR lower(name) = lower(v_name)) THEN
      RAISE EXCEPTION 'A vehicle type with that name already exists';
    END IF;
    INSERT INTO public.vehicle_types (key, name, customer_label, rate_per_km, avg_speed_kmh, max_distance_km, needs_details,
                                      needs_registration, is_active, sort_order)
    VALUES (v_key, v_name, NULLIF(trim(p_customer_label), ''), p_rate_per_km, p_avg_speed_kmh, p_max_distance_km,
            COALESCE(p_needs_details, true), COALESCE(p_needs_registration, false), COALESCE(p_is_active, true),
            (SELECT COALESCE(max(sort_order), 0) + 1 FROM public.vehicle_types));
  ELSE
    SELECT to_jsonb(t) INTO v_old FROM public.vehicle_types t WHERE key = v_key;
    IF v_old IS NULL THEN
      RAISE EXCEPTION 'Vehicle type not found';
    END IF;
    IF NOT COALESCE(p_is_active, true)
       AND NOT EXISTS (SELECT 1 FROM public.vehicle_types WHERE is_active AND key <> v_key) THEN
      RAISE EXCEPTION 'Keep at least one vehicle type active';
    END IF;
    UPDATE public.vehicle_types
    SET name = v_name, customer_label = NULLIF(trim(p_customer_label), ''), rate_per_km = p_rate_per_km,
        avg_speed_kmh = p_avg_speed_kmh, max_distance_km = p_max_distance_km,
        needs_details = COALESCE(p_needs_details, needs_details),
        needs_registration = COALESCE(p_needs_registration, needs_registration),
        is_active = COALESCE(p_is_active, is_active)
    WHERE key = v_key;
  END IF;

  PERFORM public.log_admin_action('save_vehicle_type', 'vehicle_type', v_key, v_old,
    (SELECT to_jsonb(t) FROM public.vehicle_types t WHERE key = v_key));
  RETURN v_key;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_save_vehicle_type(TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_vehicle_type(TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- ===================================================================
-- Riders: only orders their vehicle covers
-- ===================================================================

DROP POLICY IF EXISTS "Riders can view available orders for pickup" ON public.orders;
DROP FUNCTION IF EXISTS public.rider_mode_ok(TEXT, TIMESTAMPTZ);

-- Can the signed-in rider take an order with this preferred mode and trip?
--   * their vehicle covers the trip, and
--   * it's their mode's turn (the preferred mode first; everyone once widened)
CREATE OR REPLACE FUNCTION public.rider_mode_ok(p_preferred TEXT, p_widened_at TIMESTAMPTZ, p_distance_km NUMERIC, p_batch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (p_preferred IS NULL OR p_widened_at IS NOT NULL OR v.key = p_preferred)
     AND public.order_trip_km(p_distance_km, p_batch_id) <= COALESCE(v.max_distance_km, 5)
  FROM (SELECT COALESCE((SELECT vehicle_type FROM public.rider_profiles WHERE id = auth.uid()),
                        public.default_vehicle_type()) AS key) me
  LEFT JOIN public.vehicle_types v ON v.key = me.key;
$$;
REVOKE EXECUTE ON FUNCTION public.rider_mode_ok(TEXT, TIMESTAMPTZ, NUMERIC, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_mode_ok(TEXT, TIMESTAMPTZ, NUMERIC, UUID) TO authenticated;

CREATE POLICY "Riders can view available orders for pickup" ON public.orders
  FOR SELECT USING (
    public.current_user_role() = 'rider'
    AND public.is_verified_rider(auth.uid())
    AND payment_status = 'paid'
    AND status = 'ready_for_pickup'
    AND rider_id IS NULL
    AND delivery_type <> 'pickup'
    AND public.rider_mode_ok(preferred_vehicle_type, mode_widened_at, distance_km, batch_id)
    AND public.order_pickup_within_rider_radius(id)
  );

CREATE OR REPLACE FUNCTION public.rider_accept_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders%ROWTYPE;
  v_code TEXT;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'rider' THEN
    RAISE EXCEPTION 'Only riders can accept deliveries';
  END IF;
  IF NOT public.is_verified_rider(auth.uid()) THEN
    RAISE EXCEPTION 'Your account must be verified before you can accept deliveries';
  END IF;
  -- Customers and vendors need a number to reach the rider
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND public.is_valid_phone(phone)) THEN
    RAISE EXCEPTION 'Add a phone number to your profile before accepting deliveries';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.status <> 'ready_for_pickup' OR o.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'This order is no longer available';
  END IF;
  IF public.order_trip_km(o.distance_km, o.batch_id) > COALESCE((
       SELECT t.max_distance_km FROM public.vehicle_types t
       WHERE t.key = COALESCE((SELECT vehicle_type FROM public.rider_profiles WHERE id = auth.uid()), public.default_vehicle_type())), 5) THEN
    RAISE EXCEPTION 'This delivery is further than your vehicle type goes';
  END IF;
  IF NOT public.rider_mode_ok(o.preferred_vehicle_type, o.mode_widened_at, o.distance_km, o.batch_id) THEN
    RAISE EXCEPTION 'This order is being offered to another delivery mode first';
  END IF;
  IF NOT public.order_pickup_within_rider_radius(o.id) THEN
    RAISE EXCEPTION 'This order is outside your delivery range';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE rider_id = auth.uid()
             AND status = ANY (public.rider_active_statuses())) THEN
    RAISE EXCEPTION 'Finish your current delivery before accepting another';
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);

  IF o.batch_id IS NULL THEN
    UPDATE public.orders SET rider_id = auth.uid(), status = 'rider_assigned', rider_assigned_at = now()
    WHERE id = o.id;
    UPDATE public.deliveries SET rider_id = auth.uid(), status = 'accepted', accepted_at = now()
    WHERE order_id = o.id;
    RETURN;
  END IF;

  UPDATE public.deliveries SET rider_id = auth.uid(), status = 'accepted', accepted_at = now()
  WHERE order_id IN (SELECT id FROM public.orders
                     WHERE batch_id = o.batch_id AND status = 'ready_for_pickup' AND rider_id IS NULL AND payment_status = 'paid');
  UPDATE public.orders SET rider_id = auth.uid(), status = 'rider_assigned', rider_assigned_at = now()
  WHERE batch_id = o.batch_id AND status = 'ready_for_pickup' AND rider_id IS NULL AND payment_status = 'paid';
  -- One pickup code for the whole batch
  SELECT code INTO v_code FROM public.order_handover_codes WHERE order_id = o.id AND kind = 'pickup';
  UPDATE public.order_handover_codes SET code = v_code, failed_attempts = 0, used_at = NULL
  WHERE kind = 'pickup'
    AND order_id IN (SELECT id FROM public.orders WHERE batch_id = o.batch_id AND rider_id = auth.uid() AND status = 'rider_assigned');
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_riders_of_order(o orders, p_other_modes boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pickup JSONB := public.order_pickup_point(o.vendor_id, o.pickup_address);
  v_lat DOUBLE PRECISION := (v_pickup ->> 'latitude')::float8;
  v_lng DOUBLE PRECISION := (v_pickup ->> 'longitude')::float8;
  v_stops INTEGER;
  v_trip NUMERIC := public.order_trip_km(o.distance_km, o.batch_id);
  v_rider RECORD;
BEGIN
  -- One alert per batch, from its first stop
  IF o.batch_id IS NOT NULL AND COALESCE(o.batch_seq, 1) > 1 THEN
    RETURN;
  END IF;
  IF v_lat IS NULL OR v_lng IS NULL THEN
    RETURN;
  END IF;
  IF o.batch_id IS NOT NULL THEN
    SELECT count(*) INTO v_stops FROM public.orders WHERE batch_id = o.batch_id AND status = 'ready_for_pickup';
  END IF;

  FOR v_rider IN
    SELECT rp.id,
           public.distance_m((rp.current_location ->> 'latitude')::float8, (rp.current_location ->> 'longitude')::float8,
                             v_lat, v_lng) AS meters
    FROM public.rider_profiles rp
    WHERE rp.rider_status = 'available'
      AND public.is_verified_rider(rp.id)
      AND rp.current_location ? 'latitude'
      AND rp.current_location ? 'longitude'
      AND public.distance_m((rp.current_location ->> 'latitude')::float8, (rp.current_location ->> 'longitude')::float8,
                            v_lat, v_lng) <= public.rider_order_radius_m()
      -- Only riders whose vehicle covers the trip
      AND v_trip <= COALESCE((SELECT t.max_distance_km FROM public.vehicle_types t
                              WHERE t.key = COALESCE(rp.vehicle_type, public.default_vehicle_type())), 5)
      AND CASE
            WHEN o.preferred_vehicle_type IS NULL THEN NOT p_other_modes
            WHEN p_other_modes THEN COALESCE(rp.vehicle_type, public.default_vehicle_type()) <> o.preferred_vehicle_type
            ELSE o.mode_widened_at IS NOT NULL
                 OR COALESCE(rp.vehicle_type, public.default_vehicle_type()) = o.preferred_vehicle_type
          END
  LOOP
    PERFORM public.notify_user(v_rider.id, 'order_nearby', 'Order nearby',
      CASE WHEN o.batch_id IS NOT NULL
        THEN 'A batch of ' || v_stops || ' deliveries is ready for pickup '
        ELSE 'Order #' || o.order_number || ' is ready for pickup ' END
      || round((v_rider.meters / 1000)::numeric, 1) || ' km from you.', o);
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.place_order(p_vendor_id uuid, p_address_id uuid, p_items jsonb, p_special_instructions text DEFAULT NULL::text, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer UUID := auth.uid();
  v_subtotal NUMERIC;
  v_address public.addresses%ROWTYPE;
  v_phone TEXT;
  v_order public.orders%ROWTYPE;
  v_store JSONB := public.order_pickup_point(p_vendor_id, NULL);
  v_modes JSONB;
  v_mode TEXT;
  v_paid NUMERIC;
BEGIN
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'Log in to place an order';
  END IF;

  v_subtotal := public.cart_subtotal(p_vendor_id, p_items);

  SELECT * INTO v_address FROM public.addresses WHERE id = p_address_id AND profile_id = v_customer;
  IF v_address.id IS NULL THEN
    RAISE EXCEPTION 'Choose one of your saved delivery addresses';
  END IF;
  SELECT phone INTO v_phone FROM public.profiles WHERE id = v_customer;

  -- Someone has to be free to deliver it
  v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
    COALESCE((SELECT distance_km FROM public.calculate_order_price(p_vendor_id, p_address_id, 0, NULL)), 0), 0);
  IF jsonb_array_length(v_modes) > 0
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'in_range')::boolean) THEN
    RAISE EXCEPTION 'This vendor is too far from your delivery address. The longest delivery we do is %.', public.km_text(public.max_trip_km());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'Our service is currently unavailable because all our riders are busy at the moment. Please check again later.';
  END IF;
  v_mode := COALESCE(NULLIF(trim(p_vehicle_type), ''), public.default_vehicle_type());
  IF p_vehicle_type IS NOT NULL
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = v_mode AND NOT (m ->> 'in_range')::boolean) THEN
    RAISE EXCEPTION 'That delivery mode doesn''t go this far. Choose another delivery mode.';
  END IF;
  IF p_vehicle_type IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = v_mode AND (m ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'No rider with that delivery mode is free right now. Choose another delivery mode.';
  END IF;
  v_mode := public.pick_delivery_mode(v_modes, v_mode);

  INSERT INTO public.orders (
    customer_id, vendor_id, status, payment_status, delivery_type,
    delivery_address, delivery_address_id, subtotal, total_amount, special_instructions,
    preferred_vehicle_type, coupon_code
  ) VALUES (
    v_customer, p_vendor_id, 'pending', 'pending', 'standard',
    public.address_snapshot(v_address) || jsonb_build_object('phone', COALESCE(v_phone, '')),
    v_address.id, v_subtotal, v_subtotal, p_special_instructions,
    v_mode, NULLIF(trim(p_coupon_code), '')
  )
  RETURNING * INTO v_order;

  INSERT INTO public.order_items (
    order_id, product_id, product_name, product_description, product_category,
    quantity, unit_price, total_price, is_eco_friendly, carbon_impact
  )
  SELECT v_order.id, p.id, p.name, p.description, p.category,
         (i.value ->> 'quantity')::integer, p.price, p.price * (i.value ->> 'quantity')::integer,
         p.is_eco_friendly, p.carbon_impact
  FROM jsonb_array_elements(p_items) i
  JOIN public.products p ON p.id = (i.value ->> 'product_id')::uuid;

  -- Wallet first; Squad takes the rest (squad-checkout charges total - wallet_amount)
  v_paid := public.pay_order_from_customer_wallet(v_order.id);
  IF v_paid >= v_order.total_amount THEN
    PERFORM set_config('cydex.order_flow', 'on', true);
    UPDATE public.orders
    SET payment_status = 'paid', payment_reference = 'WALLET-' || v_order.order_number, payment_gateway = 'wallet',
        payment_method = 'wallet'
    WHERE id = v_order.id;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  RETURN v_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.price_new_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price RECORD;
  d RECORD;
BEGIN
  IF NEW.order_type IN ('rider_request', 'express') THEN
    RETURN NEW;
  END IF;

  IF NOT public.vendor_is_open(NEW.vendor_id) THEN
    RAISE EXCEPTION 'This vendor is closed right now. Check their opening hours and try again.';
  END IF;

  IF NEW.delivery_type = 'pickup' THEN
    -- Customer collects from the store: no delivery fee
    SELECT * INTO v_price FROM public.calculate_order_price(NEW.vendor_id, NULL, NEW.subtotal);
    NEW.distance_km := NULL;
    NEW.base_rate := NULL;
    NEW.distance_fee := NULL;
    NEW.delivery_fee := 0;
    NEW.preferred_vehicle_type := NULL;
    NEW.service_charge := v_price.service_charge;
    NEW.total_amount := COALESCE(NEW.subtotal, 0) + v_price.service_charge;
    RETURN NEW;
  END IF;

  IF NEW.delivery_address_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = NEW.delivery_address_id AND profile_id = NEW.customer_id) THEN
    RAISE EXCEPTION 'Choose one of your saved delivery addresses';
  END IF;

  SELECT * INTO v_price FROM public.calculate_order_price(NEW.vendor_id, NEW.delivery_address_id, NEW.subtotal, NEW.preferred_vehicle_type);

  IF v_price.status = 'no_store' THEN
    RAISE EXCEPTION 'This vendor has not set a store location yet, so it can''t take delivery orders';
  ELSIF v_price.status = 'out_of_range' THEN
    RAISE EXCEPTION 'This vendor is too far from your delivery address. The longest delivery we do is %.', public.km_text(public.max_trip_km());
  END IF;

  NEW.distance_km := v_price.distance_km;
  NEW.preferred_vehicle_type := v_price.vehicle_type;
  NEW.vehicle_rate_per_km := v_price.rate_per_km;
  NEW.base_rate := v_price.base_rate;
  NEW.distance_fee := v_price.distance_fee;
  NEW.delivery_fee := v_price.delivery_fee;
  NEW.service_charge := v_price.service_charge;

  SELECT * INTO d FROM public.apply_promotion('customer', NEW.vendor_id, NEW.subtotal, v_price.delivery_fee,
                                              v_price.service_charge, v_price.distance_km, v_price.vehicle_type, NEW.coupon_code);
  IF d.coupon_status = 'invalid' THEN
    RAISE EXCEPTION 'That coupon code isn''t valid for this order';
  END IF;
  NEW.promotion_id := d.promotion_id;
  NEW.discount_amount := COALESCE(d.discount_amount, 0);
  NEW.discount_target := d.discount_target;
  NEW.discount_bearer := d.discount_bearer;
  NEW.coupon_code := CASE WHEN d.coupon_status = 'applied' THEN upper(trim(NEW.coupon_code)) END;
  NEW.total_amount := GREATEST(v_price.total_amount - NEW.discount_amount, 0);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_express_order(p_pickup jsonb, p_dropoff jsonb, p_recipient_name text, p_recipient_phone text, p_recipient_email text, p_package_details text, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_mode := public.require_free_rider(public.delivery_modes(v_plat, v_plng,
    public.longest_leg_km(v_plat, v_plng, jsonb_build_array(p_dropoff)), 0), p_vehicle_type);
  SELECT * INTO q FROM public.delivery_leg_quote(v_plat, v_plng, (p_dropoff ->> 'latitude')::float8,
                                                 (p_dropoff ->> 'longitude')::float8, v_mode, v_rate);
  IF q.status = 'out_of_range' THEN
    RAISE EXCEPTION 'The drop-off is too far from the pickup point. The longest delivery we do is %.', public.km_text(public.max_trip_km());
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
$function$;

CREATE OR REPLACE FUNCTION public.create_rider_request(p_recipient_name text, p_recipient_phone text, p_recipient_email text, p_location jsonb, p_package_details text DEFAULT NULL::text, p_save_customer boolean DEFAULT false, p_vehicle_type text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
      public.longest_leg_km((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, jsonb_build_array(p_location)), 0),
    p_vehicle_type);
  SELECT * INTO q FROM public.delivery_leg_quote((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
                                                 v_lat, v_lng, v_mode, v_rate);
  IF q.status = 'out_of_range' THEN
    RAISE EXCEPTION 'The delivery location is too far from your store. The longest delivery we do is %.', public.km_text(public.max_trip_km());
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
$function$;

CREATE OR REPLACE FUNCTION public.create_rider_batch(p_stops jsonb, p_vehicle_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Name the drop-off that's too far, before looking for a rider
  v_lat := (v_store ->> 'latitude')::float8;
  v_lng := (v_store ->> 'longitude')::float8;
  FOR v_stop IN SELECT value FROM jsonb_array_elements(p_stops) LOOP
    v_seq := v_seq + 1;
    v_loc := v_stop -> 'location';
    IF public.longest_leg_km(v_lat, v_lng, jsonb_build_array(v_loc)) > public.max_trip_km() THEN
      RAISE EXCEPTION 'Drop-off % is too far from % (the longest delivery we do is %)', v_seq,
        CASE WHEN v_seq = 1 THEN 'your store' ELSE 'drop-off ' || (v_seq - 1) END, public.km_text(public.max_trip_km());
    END IF;
    v_lat := COALESCE((v_loc ->> 'latitude')::float8, v_lat);
    v_lng := COALESCE((v_loc ->> 'longitude')::float8, v_lng);
  END LOOP;
  v_seq := 0;

  SELECT COALESCE(rider_request_commission_rate, 0.10) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  v_mode := public.require_free_rider(
    public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
      public.longest_leg_km((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
                            (SELECT jsonb_agg(value -> 'location') FROM jsonb_array_elements(p_stops))), 0),
    p_vehicle_type);

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
      RAISE EXCEPTION 'Drop-off % is too far from % (the longest delivery we do is %)', v_seq,
        CASE WHEN v_seq = 1 THEN 'your store' ELSE 'drop-off ' || (v_seq - 1) END, public.km_text(public.max_trip_km());
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
$function$;

CREATE OR REPLACE FUNCTION public.batch_quote(p_stops jsonb, p_vehicle_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- The mode has to cover the longest leg of the route
  v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
    public.longest_leg_km((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, p_stops), 0);
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
$function$;

-- The longest trip, for the app's "vendors within X km" wording
GRANT EXECUTE ON FUNCTION public.customer_vendor_radius_m() TO authenticated;
