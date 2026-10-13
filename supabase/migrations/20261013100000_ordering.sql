-- ===================================================================
-- Ordering update
--   - Delivery fee by vehicle type: km x the type's price per km + flat charge
--   - Preferred delivery mode: riders with that vehicle first; after
--     preferred_mode_wait_minutes (10) it opens to every nearby rider and
--     the customer is told
--   - "No riders available" is checked before payment
--   - Estimated delivery time from real deliveries (default speeds until
--     there are enough), rounded up to 5 minutes
--   - Wallet first: the customer's wallet pays what it can, Squad the rest
--   - New status 'arrived' (rider at the drop-off) before 'delivered'
--   - Orders can't be placed while the vendor is closed
-- Columns for Cydex Express, batches and promotions are added here too, so
-- the shared functions below are written once (see the next migrations).
-- ===================================================================

-- ===================================================================
-- 1. Columns, statuses, settings
-- ===================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preferred_vehicle_type TEXT REFERENCES public.vehicle_types(key) ON UPDATE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS vehicle_rate_per_km NUMERIC(10,2);
-- When the order stopped being reserved for the preferred mode
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mode_widened_at TIMESTAMPTZ;
-- The vehicle of the rider who took it (for delivery time estimates)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rider_vehicle_type TEXT;
-- Cydex Express: where the rider collects the item (vendor orders use the store)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_address JSONB;
-- Batch rider requests: stops of one batch, in delivery order
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS batch_seq INTEGER;
-- Promotions
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promotion_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_target TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_bearer TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON public.orders (batch_id) WHERE batch_id IS NOT NULL;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.orders'::regclass AND contype = 'c'
             AND (pg_get_constraintdef(oid) LIKE 'CHECK ((status = ANY%' OR pg_get_constraintdef(oid) LIKE '%order_type = ANY%')
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'pending', 'accepted', 'ready_for_pickup', 'rider_assigned', 'picking_up', 'out_for_delivery', 'arrived',
  'delivered', 'cancelled', 'rejected'));
ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check CHECK (order_type IN ('customer', 'rider_request', 'express'));

INSERT INTO public.app_config (key, value) VALUES ('preferred_mode_wait_minutes', '10')
ON CONFLICT (key) DO NOTHING;

-- Statuses where a rider has the order
CREATE OR REPLACE FUNCTION public.rider_active_statuses()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$ SELECT ARRAY['rider_assigned', 'picking_up', 'out_for_delivery', 'arrived'] $$;

-- ===================================================================
-- 2. Where the rider collects an order, free riders, time estimates
-- ===================================================================

CREATE OR REPLACE FUNCTION public.order_pickup_point(p_vendor_id UUID, p_pickup_address JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    p_pickup_address,
    (SELECT public.address_snapshot(a) || jsonb_build_object('vendor_id', p_vendor_id)
     FROM public.addresses a WHERE a.profile_id = p_vendor_id
     ORDER BY a.is_default DESC, a.created_at DESC LIMIT 1)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.order_pickup_point(UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- Riders who could take a delivery from this point now: online, verified,
-- within their range, and not on a delivery. Counted per vehicle type.
CREATE OR REPLACE FUNCTION public.free_riders_near(p_latitude DOUBLE PRECISION, p_longitude DOUBLE PRECISION)
RETURNS TABLE (vehicle_type TEXT, riders INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(rp.vehicle_type, public.default_vehicle_type()), count(*)::int
  FROM public.rider_profiles rp
  WHERE rp.rider_status = 'available'
    AND public.is_verified_rider(rp.id)
    AND rp.current_location ? 'latitude'
    AND rp.current_location ? 'longitude'
    AND p_latitude IS NOT NULL AND p_longitude IS NOT NULL
    AND public.distance_m((rp.current_location ->> 'latitude')::float8, (rp.current_location ->> 'longitude')::float8,
                          p_latitude, p_longitude) <= public.rider_order_radius_m()
    AND NOT EXISTS (SELECT 1 FROM public.orders o
                    WHERE o.rider_id = rp.id AND o.status = ANY (public.rider_active_statuses()))
  GROUP BY 1;
$$;

REVOKE EXECUTE ON FUNCTION public.free_riders_near(DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon, authenticated;

-- Minutes to deliver p_distance_km by a vehicle type. Uses the average of real
-- deliveries by that type (pickup to delivered, last 90 days) once there are
-- at least 5; until then the type's average speed. Rounded up to 5 minutes.
-- The range is travel time to travel time + the vendor's preparation time.
CREATE OR REPLACE FUNCTION public.delivery_eta(
  p_vehicle_type TEXT,
  p_distance_km NUMERIC,
  p_prep_minutes INTEGER DEFAULT 0,
  OUT eta_min INTEGER,
  OUT eta_max INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes_per_km NUMERIC;
  v_samples INTEGER;
  v_travel NUMERIC;
BEGIN
  SELECT avg(extract(epoch FROM (o.delivered_at - o.picked_up_at)) / 60 / o.distance_km), count(*)
  INTO v_minutes_per_km, v_samples
  FROM public.orders o
  WHERE o.status = 'delivered'
    AND o.rider_vehicle_type = p_vehicle_type
    AND o.picked_up_at IS NOT NULL AND o.delivered_at > o.picked_up_at
    AND o.distance_km >= 0.3
    AND o.delivered_at > now() - interval '90 days';

  IF COALESCE(v_samples, 0) < 5 OR v_minutes_per_km IS NULL THEN
    SELECT 60 / t.avg_speed_kmh INTO v_minutes_per_km FROM public.vehicle_types t WHERE t.key = p_vehicle_type;
  END IF;
  v_travel := COALESCE(p_distance_km, 0) * COALESCE(v_minutes_per_km, 4);
  eta_min := GREATEST(5, (ceil(v_travel / 5) * 5)::int);
  eta_max := GREATEST(eta_min, (ceil((v_travel + COALESCE(p_prep_minutes, 0)) / 5) * 5)::int);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delivery_eta(TEXT, NUMERIC, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_eta(TEXT, NUMERIC, INTEGER) TO authenticated;

-- The delivery modes for a trip: label, whether a rider with that vehicle is
-- free near the pickup, the delivery fee and the time estimate
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
    'available', COALESCE(r.riders, 0) > 0,
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

REVOKE EXECUTE ON FUNCTION public.delivery_modes(DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, INTEGER) FROM PUBLIC, anon, authenticated;

-- The mode an order ends up with: the one asked for if a rider with it is
-- free, else Bicycle, else the first mode with a free rider (NULL: no riders)
CREATE OR REPLACE FUNCTION public.pick_delivery_mode(p_modes JSONB, p_wanted TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT m ->> 'key' FROM jsonb_array_elements(p_modes) WITH ORDINALITY AS x(m, ord)
  WHERE (m ->> 'available')::boolean
  ORDER BY (m ->> 'key' = p_wanted) DESC, (m ->> 'key' = 'bicycle') DESC, ord
  LIMIT 1;
$$;

-- ===================================================================
-- 3. Promotions hook (the real rules come with the promotions migration)
-- ===================================================================

CREATE OR REPLACE FUNCTION public.apply_promotion(
  p_order_type TEXT,
  p_vendor_id UUID,
  p_subtotal NUMERIC,
  p_delivery_fee NUMERIC,
  p_service_charge NUMERIC,
  p_distance_km NUMERIC,
  p_vehicle_type TEXT,
  p_coupon_code TEXT,
  OUT promotion_id UUID,
  OUT promotion_name TEXT,
  OUT discount_amount NUMERIC,
  OUT discount_target TEXT,
  OUT discount_bearer TEXT,
  OUT coupon_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  discount_amount := 0;
  coupon_status := CASE WHEN NULLIF(trim(p_coupon_code), '') IS NULL THEN 'none' ELSE 'invalid' END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_promotion(TEXT, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- 4. Pricing a customer order
-- ===================================================================

DROP FUNCTION IF EXISTS public.quote_order(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.calculate_order_price(UUID, UUID, NUMERIC);

CREATE OR REPLACE FUNCTION public.calculate_order_price(
    p_vendor_id UUID,
    p_address_id UUID,
    p_subtotal NUMERIC,
    p_vehicle_type TEXT DEFAULT NULL,
    OUT status TEXT,
    OUT distance_km NUMERIC,
    OUT vehicle_type TEXT,
    OUT rate_per_km NUMERIC,
    OUT base_rate NUMERIC,
    OUT distance_fee NUMERIC,
    OUT delivery_fee NUMERIC,
    OUT service_charge NUMERIC,
    OUT total_amount NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.pricing_config%ROWTYPE;
  v_store public.addresses%ROWTYPE;
  v_dest public.addresses%ROWTYPE;
  v_distance_m DOUBLE PRECISION;
  f RECORD;
BEGIN
  SELECT * INTO v_config FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  service_charge := round(COALESCE(p_subtotal, 0) * COALESCE(v_config.service_charge_rate, 0.15), 2);

  SELECT * INTO v_dest FROM public.addresses WHERE id = p_address_id;
  SELECT * INTO v_store FROM public.addresses
  WHERE profile_id = p_vendor_id
  ORDER BY is_default DESC, created_at DESC
  LIMIT 1;

  IF v_dest.id IS NULL THEN
    status := 'no_address';
    RETURN;
  END IF;
  IF v_store.id IS NULL THEN
    status := 'no_store';
    RETURN;
  END IF;

  v_distance_m := public.distance_m(v_store.latitude, v_store.longitude, v_dest.latitude, v_dest.longitude);
  distance_km := round((v_distance_m / 1000)::numeric, 2);
  -- km x the vehicle's price per km + the flat charge
  SELECT * INTO f FROM public.delivery_fee_for(distance_km, p_vehicle_type);
  vehicle_type := f.vehicle_type;
  rate_per_km := f.rate_per_km;
  base_rate := f.base_rate;
  distance_fee := f.distance_fee;
  delivery_fee := f.delivery_fee;
  total_amount := COALESCE(p_subtotal, 0) + service_charge + delivery_fee;
  status := CASE WHEN v_distance_m <= public.customer_vendor_radius_m() THEN 'ok' ELSE 'out_of_range' END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_order_price(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;

-- Everything the checkout needs in one call: price for the chosen delivery
-- mode, the modes on offer (with riders, fee and time for each), whether any
-- rider is free, whether the vendor is open, and the wallet / card split
CREATE OR REPLACE FUNCTION public.checkout_quote(
  p_vendor_id UUID,
  p_address_id UUID,
  p_items JSONB,
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
  v_subtotal NUMERIC := public.cart_subtotal(p_vendor_id, p_items);
  v_address UUID := (SELECT a.id FROM public.addresses a WHERE a.id = p_address_id AND a.profile_id = auth.uid());
  v_store JSONB := public.order_pickup_point(p_vendor_id, NULL);
  v_prep INTEGER;
  v_modes JSONB := '[]'::jsonb;
  v_mode TEXT;
  p RECORD;
  d RECORD;
  v_wallet NUMERIC;
  v_total NUMERIC;
BEGIN
  SELECT COALESCE((SELECT prep_time_minutes FROM public.vendor_hours WHERE vendor_id = p_vendor_id), 15) INTO v_prep;
  SELECT * INTO p FROM public.calculate_order_price(p_vendor_id, v_address, v_subtotal, p_vehicle_type);

  IF p.status IN ('ok', 'out_of_range') THEN
    v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, p.distance_km, v_prep);
    -- Price for the mode they'll actually get (their choice if it's available)
    v_mode := COALESCE(public.pick_delivery_mode(v_modes, COALESCE(p_vehicle_type, public.default_vehicle_type())), p.vehicle_type);
    SELECT * INTO p FROM public.calculate_order_price(p_vendor_id, v_address, v_subtotal, v_mode);
  END IF;

  SELECT * INTO d FROM public.apply_promotion('customer', p_vendor_id, v_subtotal, p.delivery_fee, p.service_charge,
                                              p.distance_km, p.vehicle_type, p_coupon_code);
  v_total := GREATEST(COALESCE(p.total_amount, v_subtotal + p.service_charge) - COALESCE(d.discount_amount, 0), 0);
  SELECT COALESCE(available_balance, 0) INTO v_wallet FROM public.customer_wallet WHERE customer_id = auth.uid();
  v_wallet := COALESCE(v_wallet, 0);

  RETURN jsonb_build_object(
    'status', p.status,
    'subtotal', v_subtotal,
    'distance_km', p.distance_km,
    'vehicle_type', p.vehicle_type,
    'rate_per_km', p.rate_per_km,
    'base_rate', p.base_rate,
    'distance_fee', p.distance_fee,
    'delivery_fee', p.delivery_fee,
    'service_charge', p.service_charge,
    'discount_amount', COALESCE(d.discount_amount, 0),
    'discount_target', d.discount_target,
    'promotion_name', d.promotion_name,
    'coupon_status', d.coupon_status,
    'total_amount', v_total,
    'wallet_balance', v_wallet,
    'wallet_amount', LEAST(v_wallet, v_total),
    'card_amount', v_total - LEAST(v_wallet, v_total),
    'vendor_open', public.vendor_is_open(p_vendor_id),
    'prep_time_minutes', v_prep,
    'riders_available', EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean),
    'modes', v_modes,
    'eta_min', (SELECT (m ->> 'eta_min')::int FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = p.vehicle_type),
    'eta_max', (SELECT (m ->> 'eta_max')::int FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = p.vehicle_type)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.checkout_quote(UUID, UUID, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_quote(UUID, UUID, JSONB, TEXT, TEXT) TO authenticated;

-- Prices every new customer order (Express and rider requests are priced by
-- the functions that create them)
CREATE OR REPLACE FUNCTION public.price_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE EXCEPTION 'This vendor is more than 5 km from your delivery address';
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
$$;

-- Prices, payment split and delivery details are fixed once created
CREATE OR REPLACE FUNCTION public.protect_order_prices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin()
     AND COALESCE(current_setting('cydex.order_flow', true), '') <> 'on' AND (
       NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
    OR NEW.service_charge IS DISTINCT FROM OLD.service_charge
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.distance_km IS DISTINCT FROM OLD.distance_km
    OR NEW.base_rate IS DISTINCT FROM OLD.base_rate
    OR NEW.distance_fee IS DISTINCT FROM OLD.distance_fee
    OR NEW.wallet_amount IS DISTINCT FROM OLD.wallet_amount
    OR NEW.wallet_refunded IS DISTINCT FROM OLD.wallet_refunded
    OR NEW.dispatch_priority IS DISTINCT FROM OLD.dispatch_priority
    OR NEW.order_type IS DISTINCT FROM OLD.order_type
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
    OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
    OR (NEW.delivery_address_id IS DISTINCT FROM OLD.delivery_address_id AND NEW.delivery_address_id IS NOT NULL)
    OR NEW.preferred_vehicle_type IS DISTINCT FROM OLD.preferred_vehicle_type
    OR NEW.vehicle_rate_per_km IS DISTINCT FROM OLD.vehicle_rate_per_km
    OR NEW.mode_widened_at IS DISTINCT FROM OLD.mode_widened_at
    OR NEW.rider_vehicle_type IS DISTINCT FROM OLD.rider_vehicle_type
    OR NEW.pickup_address IS DISTINCT FROM OLD.pickup_address
    OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
    OR NEW.batch_seq IS DISTINCT FROM OLD.batch_seq
    OR NEW.promotion_id IS DISTINCT FROM OLD.promotion_id
    OR NEW.coupon_code IS DISTINCT FROM OLD.coupon_code
    OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
    OR NEW.discount_target IS DISTINCT FROM OLD.discount_target
    OR NEW.discount_bearer IS DISTINCT FROM OLD.discount_bearer
    OR NEW.arrived_at IS DISTINCT FROM OLD.arrived_at
  ) THEN
    RAISE EXCEPTION 'Order prices and delivery details can''t be changed after the order is placed';
  END IF;
  RETURN NEW;
END;
$$;

-- ===================================================================
-- 5. Placing an order: riders must be free, wallet pays first
-- ===================================================================

-- Takes what the payer's wallet can cover for a new order. Returns the amount taken.
CREATE OR REPLACE FUNCTION public.pay_order_from_customer_wallet(p_order_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_wallet NUMERIC;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  SELECT available_balance INTO v_wallet FROM public.customer_wallet WHERE customer_id = o.customer_id FOR UPDATE;
  v_wallet := LEAST(COALESCE(v_wallet, 0), o.total_amount);
  IF v_wallet <= 0 THEN
    RETURN 0;
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);
  UPDATE public.customer_wallet
  SET available_balance = available_balance - v_wallet, total_spent = COALESCE(total_spent, 0) + v_wallet, updated_at = now()
  WHERE customer_id = o.customer_id;
  UPDATE public.orders SET wallet_amount = v_wallet WHERE id = o.id;
  INSERT INTO public.customer_transactions (
    customer_id, transaction_id, type, amount, status, description, reference_id, reference_type,
    payment_method, processed_at, metadata
  ) VALUES (
    o.customer_id, 'WALLET-' || o.order_number, 'payment', v_wallet, 'completed',
    CASE WHEN o.order_type = 'express' THEN 'Cydex Express ' ELSE 'Order ' END || o.order_number || ' paid from wallet',
    o.id, 'order', 'wallet', now(), jsonb_build_object('order_number', o.order_number)
  );
  RETURN v_wallet;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_order_from_customer_wallet(UUID) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.place_order(UUID, UUID, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.place_order(
  p_vendor_id UUID,
  p_address_id UUID,
  p_items JSONB,
  p_special_instructions TEXT DEFAULT NULL,
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
  v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, 0, 0);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'Our service is currently unavailable because all our riders are busy at the moment. Please check again later.';
  END IF;
  v_mode := COALESCE(NULLIF(trim(p_vehicle_type), ''), public.default_vehicle_type());
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
$$;

REVOKE EXECUTE ON FUNCTION public.place_order(UUID, UUID, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(UUID, UUID, JSONB, TEXT, TEXT, TEXT) TO authenticated;

-- Money back to whoever paid: the customer (orders, Cydex Express) or the
-- vendor (rider requests). Paid: everything not already refunded. Not paid
-- yet: just the part their wallet covered.
CREATE OR REPLACE FUNCTION public.refund_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_amount NUMERIC;
  v_label TEXT;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);

  v_amount := CASE WHEN o.payment_status = 'paid' THEN o.total_amount - o.wallet_refunded
                   WHEN o.payment_status IN ('pending', 'failed') THEN o.wallet_amount - o.wallet_refunded
                   ELSE 0 END;
  v_label := CASE o.order_type WHEN 'rider_request' THEN 'rider request' WHEN 'express' THEN 'Cydex Express' ELSE 'order' END;

  IF v_amount > 0 THEN
    UPDATE public.orders SET wallet_refunded = o.wallet_amount WHERE id = o.id;

    IF o.order_type = 'rider_request' THEN
      UPDATE public.vendor_wallet SET available_balance = available_balance + v_amount, updated_at = now()
      WHERE vendor_id = o.vendor_id;
      INSERT INTO public.vendor_transactions (
        vendor_id, transaction_id, type, amount, fee, net_amount, status, description,
        reference_id, reference_type, processed_at, metadata
      ) VALUES (
        o.vendor_id, 'REFUND-' || o.order_number || '-' || o.payment_status, 'refund', v_amount, 0, v_amount, 'completed',
        'Refund for rider request ' || o.order_number, o.id, 'order', now(),
        jsonb_build_object('order_number', o.order_number)
      );
      PERFORM public.notify_user(o.vendor_id, 'refund', 'Refund issued',
        '₦' || to_char(v_amount, 'FM999,999,990.00') || ' for rider request #' || o.order_number
        || ' has been added to your wallet.', o);
    ELSE
      INSERT INTO public.customer_wallet (customer_id, available_balance)
      VALUES (o.customer_id, v_amount)
      ON CONFLICT (customer_id) DO UPDATE
      SET available_balance = customer_wallet.available_balance + EXCLUDED.available_balance, updated_at = now();
      INSERT INTO public.customer_transactions (
        customer_id, transaction_id, type, amount, status, description,
        reference_id, reference_type, processed_at, metadata
      ) VALUES (
        o.customer_id, 'REFUND-' || o.order_number || '-' || o.payment_status, 'refund', v_amount, 'completed',
        'Refund for ' || v_label || ' ' || o.order_number, o.id, 'order', now(),
        jsonb_build_object('reason', o.cancel_reason, 'payment_reference', o.payment_reference)
      );
      PERFORM public.notify_user(o.customer_id, 'refund', 'Refund issued',
        '₦' || to_char(v_amount, 'FM999,999,990.00') || ' for ' || v_label || ' #' || o.order_number
        || ' has been added to your wallet.', o);
      PERFORM public.queue_email(o.customer_id, 'refund', 'Refund for ' || v_label || ' #' || o.order_number,
        jsonb_build_object('order_number', o.order_number, 'amount', v_amount));
    END IF;
  END IF;

  IF o.payment_status = 'paid' THEN
    UPDATE public.payment_holds SET status = 'refunded', updated_at = now() WHERE order_id = o.id;
    UPDATE public.orders SET payment_status = 'refunded' WHERE id = o.id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_order(UUID) FROM PUBLIC, anon, authenticated;

-- Orders part-paid from a wallet but never finished at Squad: after 30 minutes
-- the order is cancelled and the wallet money goes back (runs every 5 minutes)
CREATE OR REPLACE FUNCTION public.release_unpaid_wallet_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR o IN
    SELECT id FROM public.orders
    WHERE status = 'pending' AND payment_status IN ('pending', 'failed')
      AND wallet_amount > wallet_refunded
      AND created_at < now() - interval '30 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM set_config('cydex.order_flow', 'on', true);
    UPDATE public.orders
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'system',
        cancel_reason = 'Payment wasn''t completed'
    WHERE id = o.id;
    PERFORM public.refund_order(o.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_unpaid_wallet_orders() FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- 6. Riders: preferred mode, batches, arriving
-- ===================================================================

-- Can the signed-in rider take an order reserved for p_preferred?
CREATE OR REPLACE FUNCTION public.rider_mode_ok(p_preferred TEXT, p_widened_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_preferred IS NULL
      OR p_widened_at IS NOT NULL
      OR COALESCE((SELECT vehicle_type FROM public.rider_profiles WHERE id = auth.uid()), public.default_vehicle_type()) = p_preferred;
$$;

REVOKE EXECUTE ON FUNCTION public.rider_mode_ok(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_mode_ok(TEXT, TIMESTAMPTZ) TO authenticated;

DROP POLICY IF EXISTS "Riders can view available orders for pickup" ON public.orders;
CREATE POLICY "Riders can view available orders for pickup" ON public.orders
  FOR SELECT USING (
    public.current_user_role() = 'rider'
    AND public.is_verified_rider(auth.uid())
    AND payment_status = 'paid'
    AND status = 'ready_for_pickup'
    AND rider_id IS NULL
    AND delivery_type <> 'pickup'
    AND public.rider_mode_ok(preferred_vehicle_type, mode_widened_at)
    AND public.order_pickup_within_rider_radius(id)
  );

-- Remembers which vehicle the rider who took the order uses
CREATE OR REPLACE FUNCTION public.set_rider_vehicle_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.rider_id IS DISTINCT FROM OLD.rider_id THEN
    NEW.rider_vehicle_type := (SELECT vehicle_type FROM public.rider_profiles WHERE id = NEW.rider_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_rider_vehicle_type ON public.orders;
CREATE TRIGGER set_rider_vehicle_type
  BEFORE UPDATE OF rider_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_rider_vehicle_type();

-- Rider: accept an available order. A batch is accepted whole: every stop
-- still available goes to this rider, with one pickup code for the lot.
CREATE OR REPLACE FUNCTION public.rider_accept_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF NOT public.rider_mode_ok(o.preferred_vehicle_type, o.mode_widened_at) THEN
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
$$;

REVOKE EXECUTE ON FUNCTION public.rider_accept_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_accept_order(UUID) TO authenticated;

-- Rider: on the way to collect (every stop of a batch together)
CREATE OR REPLACE FUNCTION public.rider_start_pickup(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'rider');
BEGIN
  IF o.status <> 'rider_assigned' THEN
    RAISE EXCEPTION 'This order isn''t waiting for pickup';
  END IF;
  UPDATE public.deliveries SET status = 'picking_up', picking_up_at = now()
  WHERE order_id IN (SELECT id FROM public.orders
                     WHERE (id = o.id OR (o.batch_id IS NOT NULL AND batch_id = o.batch_id))
                       AND rider_id = auth.uid() AND status = 'rider_assigned');
  UPDATE public.orders SET status = 'picking_up', pickup_started_at = now()
  WHERE (id = o.id OR (o.batch_id IS NOT NULL AND batch_id = o.batch_id))
    AND rider_id = auth.uid() AND status = 'rider_assigned';
END;
$$;

-- Moves an order (and the rest of its batch with the same rider) to out for
-- delivery once the pickup code has been checked
CREATE OR REPLACE FUNCTION public.mark_picked_up(o public.orders)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.order_handover_codes SET used_at = now()
  WHERE kind = 'pickup' AND used_at IS NULL
    AND order_id IN (SELECT id FROM public.orders
                     WHERE o.batch_id IS NOT NULL AND batch_id = o.batch_id AND rider_id = o.rider_id
                       AND status IN ('rider_assigned', 'picking_up'));
  UPDATE public.deliveries SET status = 'picked_up', picked_up_at = now()
  WHERE order_id IN (SELECT id FROM public.orders
                     WHERE (id = o.id OR (o.batch_id IS NOT NULL AND batch_id = o.batch_id))
                       AND rider_id = o.rider_id AND status IN ('rider_assigned', 'picking_up'));
  UPDATE public.orders SET status = 'out_for_delivery', picked_up_at = now()
  WHERE (id = o.id OR (o.batch_id IS NOT NULL AND batch_id = o.batch_id))
    AND rider_id = o.rider_id AND status IN ('rider_assigned', 'picking_up');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_picked_up(public.orders) FROM PUBLIC, anon, authenticated;

-- Vendor: enter the rider's pickup code to hand the order (or batch) over
CREATE OR REPLACE FUNCTION public.vendor_confirm_pickup(p_order_id UUID, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'vendor');
BEGIN
  IF o.status NOT IN ('rider_assigned', 'picking_up') THEN
    RAISE EXCEPTION 'This order isn''t waiting for a rider to collect it';
  END IF;
  IF NOT public.check_handover_code(o.id, 'pickup', p_code) THEN
    RETURN false;
  END IF;
  PERFORM public.mark_picked_up(o);
  RETURN true;
END;
$$;

-- Rider: "I've arrived" at the drop-off. The customer is told to bring the code.
CREATE OR REPLACE FUNCTION public.rider_mark_arrived(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'rider');
BEGIN
  IF o.status <> 'out_for_delivery' THEN
    RAISE EXCEPTION 'This order isn''t out for delivery';
  END IF;
  UPDATE public.orders SET status = 'arrived', arrived_at = now() WHERE id = o.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rider_mark_arrived(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_mark_arrived(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rider_confirm_delivery(p_order_id UUID, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'rider');
BEGIN
  IF o.status NOT IN ('out_for_delivery', 'arrived') THEN
    RAISE EXCEPTION 'This order isn''t out for delivery';
  END IF;
  IF NOT public.check_handover_code(o.id, 'delivery', p_code) THEN
    RETURN false;
  END IF;
  UPDATE public.orders SET status = 'delivered', delivered_at = now() WHERE id = o.id;
  UPDATE public.deliveries SET status = 'delivered', delivered_at = now() WHERE order_id = o.id;
  RETURN true;
END;
$$;

-- The delivery record: collected from the vendor's store, or from the
-- pickup point of a Cydex Express order
CREATE OR REPLACE FUNCTION public.create_delivery_for_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup JSONB;
  v_rider_share NUMERIC;
BEGIN
  IF NEW.status = 'ready_for_pickup' AND OLD.status IS DISTINCT FROM 'ready_for_pickup'
     AND NEW.payment_status = 'paid'
     AND NEW.delivery_type != 'pickup'
     AND NOT EXISTS (SELECT 1 FROM public.deliveries WHERE order_id = NEW.id) THEN

    v_pickup := public.order_pickup_point(NEW.vendor_id, NEW.pickup_address);
    SELECT COALESCE(rider_share_rate, 0.85) INTO v_rider_share
    FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;

    INSERT INTO public.deliveries (
      order_id, status, estimated_pickup_time, estimated_delivery_time, delivery_fee, rider_earning,
      pickup_location, pickup_address_id, delivery_location, delivery_address_id
    ) VALUES (
      NEW.id, 'available', NOW() + INTERVAL '15 minutes', NOW() + INTERVAL '45 minutes',
      NEW.delivery_fee,
      round(COALESCE(NEW.delivery_fee, 0) * COALESCE(v_rider_share, 0.85), 2),
      COALESCE(v_pickup, jsonb_build_object('address', 'Vendor Location', 'vendor_id', NEW.vendor_id)),
      (v_pickup ->> 'address_id')::uuid,
      NEW.delivery_address,
      NEW.delivery_address_id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ===================================================================
-- 7. Notifications
-- ===================================================================

-- Tells free riders near the pickup about an order. p_other_modes: only riders
-- whose vehicle is NOT the preferred one (when the order opens to everyone).
CREATE OR REPLACE FUNCTION public.notify_riders_of_order(o public.orders, p_other_modes BOOLEAN DEFAULT false)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup JSONB := public.order_pickup_point(o.vendor_id, o.pickup_address);
  v_lat DOUBLE PRECISION := (v_pickup ->> 'latitude')::float8;
  v_lng DOUBLE PRECISION := (v_pickup ->> 'longitude')::float8;
  v_stops INTEGER;
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
$$;

REVOKE EXECUTE ON FUNCTION public.notify_riders_of_order(public.orders, BOOLEAN) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_order_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref TEXT := '#' || NEW.order_number;
  v_hold public.payment_holds%ROWTYPE;
  v_express BOOLEAN := NEW.order_type = 'express';
  v_request BOOLEAN := NEW.order_type = 'rider_request';
  v_recipient TEXT := COALESCE(NULLIF(NEW.delivery_address ->> 'name', ''), 'the recipient');
BEGIN
  -- Payment confirmed: the vendor can now accept it (a payment that lands
  -- after the customer cancelled is refunded instead; see confirm_order_payment)
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' AND NEW.status = 'pending' THEN
    PERFORM public.notify_user(NEW.vendor_id, 'new_order', 'New order',
      'Order ' || v_ref || ' has been paid and is waiting for you to accept it.', NEW);
    PERFORM public.notify_user(NEW.customer_id, 'payment_confirmed', 'Payment confirmed',
      'We''ve received your payment for order ' || v_ref || '. The vendor will accept it shortly.', NEW);
    PERFORM public.queue_email(NEW.customer_id, 'payment_confirmed', 'Payment confirmed for order ' || v_ref,
      jsonb_build_object('order_number', NEW.order_number, 'total_amount', NEW.total_amount));
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  CASE NEW.status
    WHEN 'accepted' THEN
      PERFORM public.notify_user(NEW.customer_id, 'order_accepted', 'Order accepted',
        'The vendor accepted order ' || v_ref || ' and is preparing it.', NEW);

    WHEN 'ready_for_pickup' THEN
      IF v_request AND COALESCE(NEW.batch_seq, 1) = 1 THEN
        PERFORM public.notify_user(NEW.vendor_id, 'rider_request_live', 'Finding you a rider',
          CASE WHEN NEW.batch_id IS NOT NULL THEN 'Your batch is live. Nearby riders have been notified.'
               ELSE 'Rider request ' || v_ref || ' is live. Nearby riders have been notified.' END, NEW);
      ELSIF v_express THEN
        PERFORM public.notify_user(NEW.customer_id, 'rider_request_live', 'Finding you a rider',
          'Cydex Express ' || v_ref || ' is paid. Nearby riders have been notified.', NEW);
      ELSIF NOT v_request THEN
        PERFORM public.notify_user(NEW.customer_id, 'order_ready', 'Order ready',
          'Order ' || v_ref || ' is ready. We''re finding a rider to pick it up.', NEW);
      END IF;
      PERFORM public.notify_riders_of_order(NEW);

    WHEN 'rider_assigned' THEN
      IF v_request THEN
        IF COALESCE(NEW.batch_seq, 1) = 1 THEN
          PERFORM public.notify_user(NEW.vendor_id, 'rider_assigned', 'Rider on the way',
            CASE WHEN NEW.batch_id IS NOT NULL THEN 'A rider accepted your batch and will come to collect it.'
                 ELSE 'A rider accepted rider request ' || v_ref || ' and will come to collect it.' END, NEW);
        END IF;
      ELSE
        PERFORM public.notify_user(NEW.customer_id, 'rider_assigned', 'Rider assigned',
          'A rider has accepted ' || CASE WHEN v_express THEN 'Cydex Express ' ELSE 'order ' END || v_ref || '.', NEW);
      END IF;

    WHEN 'picking_up' THEN
      IF v_express THEN
        PERFORM public.notify_user(NEW.customer_id, 'rider_heading_to_vendor', 'Rider on the way to you',
          'Your rider is heading to the pickup point for Cydex Express ' || v_ref || '. Ask them for their pickup code.', NEW);
      ELSIF NOT v_request THEN
        PERFORM public.notify_user(NEW.customer_id, 'rider_heading_to_vendor', 'Rider on the way to the vendor',
          'Your rider is heading to the vendor to collect order ' || v_ref || '.', NEW);
      END IF;

    WHEN 'out_for_delivery' THEN
      IF v_express THEN
        PERFORM public.notify_user(NEW.customer_id, 'out_for_delivery', 'Item on its way',
          'Your rider has collected Cydex Express ' || v_ref || ' and is heading to ' || v_recipient || '.', NEW);
      ELSIF v_request THEN
        IF COALESCE(NEW.batch_seq, 1) = 1 THEN
          PERFORM public.notify_user(NEW.vendor_id, 'picked_up', 'Order picked up',
            CASE WHEN NEW.batch_id IS NOT NULL THEN 'The rider has collected your batch.'
                 ELSE 'The rider has collected rider request ' || v_ref || '.' END, NEW);
        END IF;
      ELSE
        PERFORM public.notify_user(NEW.customer_id, 'out_for_delivery', 'Order on its way',
          'Your rider has picked up order ' || v_ref || '. Have your delivery code ready.', NEW);
        PERFORM public.notify_user(NEW.vendor_id, 'picked_up', 'Order picked up',
          'The rider has collected order ' || v_ref || '.', NEW);
      END IF;

    WHEN 'arrived' THEN
      IF v_express THEN
        PERFORM public.notify_user(NEW.customer_id, 'rider_arrived', 'Rider is around',
          'Your rider is at the drop-off for Cydex Express ' || v_ref || '. ' || v_recipient || ' should give them the delivery code.', NEW);
      ELSIF v_request THEN
        PERFORM public.notify_user(NEW.vendor_id, 'rider_arrived', 'Rider is around',
          'Your rider is at ' || v_recipient || '''s location for rider request ' || v_ref || '.', NEW);
      ELSE
        PERFORM public.notify_user(NEW.customer_id, 'rider_arrived', 'Your rider is around',
          'Your rider is around with order ' || v_ref || '. Meet them and give them your delivery code to collect it.', NEW);
      END IF;

    WHEN 'delivered' THEN
      SELECT * INTO v_hold FROM public.payment_holds WHERE order_id = NEW.id;
      IF v_express THEN
        PERFORM public.notify_user(NEW.customer_id, 'delivered', 'Item delivered',
          'Cydex Express ' || v_ref || ' was delivered to ' || v_recipient || '.', NEW);
      ELSIF v_request THEN
        PERFORM public.notify_user(NEW.vendor_id, 'delivered', 'Delivery complete',
          'Your rider request ' || v_ref || ' was delivered to ' || v_recipient || '.', NEW);
      ELSE
        PERFORM public.notify_user(NEW.customer_id, 'delivered', 'Order delivered',
          'Order ' || v_ref || ' has been delivered. Enjoy!', NEW);
        PERFORM public.notify_user(NEW.vendor_id, 'delivered', 'Order delivered',
          'Order ' || v_ref || ' was delivered. ₦' || to_char(COALESCE(v_hold.vendor_amount, 0), 'FM999,999,990.00')
          || ' has been added to your wallet.', NEW);
      END IF;
      PERFORM public.notify_user(NEW.rider_id, 'delivered', 'Delivery complete',
        'Order ' || v_ref || ' was delivered. ₦' || to_char(COALESCE(v_hold.rider_amount, 0), 'FM999,999,990.00')
        || ' has been added to your wallet.', NEW);

    WHEN 'cancelled' THEN
      IF NEW.cancelled_by = 'admin' THEN
        PERFORM public.notify_user(NEW.customer_id, 'cancelled', 'Order cancelled by Cydex',
          'Cydex cancelled order ' || v_ref || ': ' || COALESCE(NEW.cancel_reason, 'no reason given') || '.', NEW);
        PERFORM public.notify_user(NEW.vendor_id, 'cancelled', 'Order cancelled by Cydex',
          'Cydex cancelled order ' || v_ref || ': ' || COALESCE(NEW.cancel_reason, 'no reason given') || '.', NEW);
        PERFORM public.notify_user(NEW.rider_id, 'cancelled', 'Delivery cancelled',
          'Cydex cancelled order ' || v_ref || '. You no longer need to deliver it.', NEW);
        RETURN NEW;
      END IF;
      IF NEW.cancelled_by = 'system' THEN
        PERFORM public.notify_user(COALESCE(NEW.customer_id, NEW.vendor_id), 'cancelled', 'Order cancelled',
          'Order ' || v_ref || ' was cancelled because the payment wasn''t completed.', NEW);
        RETURN NEW;
      END IF;
      PERFORM public.notify_user(NEW.customer_id, 'cancelled', 'Order cancelled',
        'You cancelled ' || CASE WHEN v_express THEN 'Cydex Express ' ELSE 'order ' END || v_ref || '.', NEW);
      -- Vendors never saw unpaid orders, so only tell them about paid ones.
      -- (A cancelled rider request is the vendor's own action.)
      IF OLD.payment_status = 'paid' AND NEW.order_type = 'customer' THEN
        PERFORM public.notify_user(NEW.vendor_id, 'cancelled', 'Order cancelled',
          'The customer cancelled order ' || v_ref || '.', NEW);
      END IF;

    WHEN 'rejected' THEN
      PERFORM public.notify_user(NEW.customer_id, 'rejected', 'Order rejected',
        'The vendor couldn''t take order ' || v_ref || COALESCE(': ' || NULLIF(NEW.cancel_reason, ''), '') || '.', NEW);

    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- Orders nobody with the preferred vehicle took in time open to every nearby
-- rider, and whoever placed them is told (runs every minute)
CREATE OR REPLACE FUNCTION public.widen_preferred_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_minutes INTEGER;
  v_label TEXT;
  v_count INTEGER := 0;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::integer, 10) INTO v_minutes FROM public.app_config WHERE key = 'preferred_mode_wait_minutes';
  v_minutes := COALESCE(v_minutes, 10);

  FOR o IN
    SELECT * FROM public.orders
    WHERE status = 'ready_for_pickup' AND rider_id IS NULL AND payment_status = 'paid'
      AND preferred_vehicle_type IS NOT NULL AND mode_widened_at IS NULL
      AND ready_for_pickup_at < now() - make_interval(mins => v_minutes)
    ORDER BY batch_id, batch_seq
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM set_config('cydex.order_flow', 'on', true);
    UPDATE public.orders SET mode_widened_at = now() WHERE id = o.id;
    PERFORM public.notify_riders_of_order(o, true);
    IF COALESCE(o.batch_seq, 1) = 1 THEN
      SELECT COALESCE(customer_label, name) INTO v_label FROM public.vehicle_types WHERE key = o.preferred_vehicle_type;
      PERFORM public.notify_user(COALESCE(o.customer_id, o.vendor_id), 'mode_widened', 'Finding another rider',
        'No ' || COALESCE(v_label, 'preferred') || ' rider picked up '
        || CASE WHEN o.batch_id IS NOT NULL THEN 'your batch' ELSE '#' || o.order_number END
        || ' within ' || v_minutes || ' minutes, so we''ve offered it to our other delivery partners.', o);
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.widen_preferred_orders() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    PERFORM cron.schedule('widen-preferred-orders', '* * * * *', 'SELECT public.widen_preferred_orders()');
    PERFORM cron.schedule('release-unpaid-wallet-orders', '*/5 * * * *', 'SELECT public.release_unpaid_wallet_orders()');
  END IF;
END;
$$;

-- ===================================================================
-- 8. Admin: 'arrived' counts as an active delivery, and a rider waiting
--    at the drop-off for 15 minutes is flagged
--    (same functions as before with the status lists updated)
-- ===================================================================

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ := COALESCE(p_to, now());
  v_bucket TEXT;
  v JSONB;
BEGIN
  PERFORM public.require_admin();
  v_from := COALESCE(p_from, (SELECT min(created_at) FROM public.orders), now());
  v_bucket := CASE WHEN v_to - v_from > interval '93 days' THEN 'month' ELSE 'day' END;

  WITH paid AS (
    -- every order that was paid for in the period (including ones refunded later)
    SELECT o.id, o.order_type, o.total_amount, o.payment_status,
           COALESCE(h.created_at, o.created_at) AS paid_at
    FROM public.orders o
    LEFT JOIN public.payment_holds h ON h.order_id = o.id
    WHERE o.payment_status IN ('paid', 'refunded')
      AND COALESCE(h.created_at, o.created_at) >= v_from AND COALESCE(h.created_at, o.created_at) < v_to
  ),
  delivered AS (
    SELECT * FROM public.order_money_split WHERE delivered_at >= v_from AND delivered_at < v_to
  ),
  -- Withdrawal fees Cydex kept: only on withdrawals actually paid out
  -- (failed or rejected ones are refunded in full, fee included)
  payout_fees AS (
    SELECT fee, processed_at FROM (
      SELECT fee, processed_at, status FROM public.vendor_payout_requests
      UNION ALL SELECT fee, processed_at, status FROM public.rider_payout_requests
      UNION ALL SELECT fee, processed_at, status FROM public.customer_withdrawal_requests
    ) x
    WHERE status = 'completed' AND processed_at >= v_from AND processed_at < v_to
  ),
  buckets AS (
    SELECT generate_series(date_trunc(v_bucket, v_from), date_trunc(v_bucket, v_to),
                           CASE WHEN v_bucket = 'month' THEN interval '1 month' ELSE interval '1 day' END) AS b
  )
  SELECT jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'bucket', v_bucket,
    'transactions', jsonb_build_object(
      'count', (SELECT count(*) FROM paid),
      'amount', (SELECT COALESCE(sum(total_amount), 0) FROM paid),
      'refunded_count', (SELECT count(*) FROM paid WHERE payment_status = 'refunded'),
      'refunded_amount', (SELECT COALESCE(sum(total_amount), 0) FROM paid WHERE payment_status = 'refunded'),
      'rider_requests', (SELECT count(*) FROM paid WHERE order_type = 'rider_request')
    ),
    'delivered_orders', (SELECT count(*) FROM delivered),
    'revenue', jsonb_build_object(
      'from_customers', (SELECT COALESCE(sum(cydex_from_customer), 0) FROM delivered),
      'from_vendors', (SELECT COALESCE(sum(cydex_from_vendor), 0) FROM delivered),
      'from_riders', (SELECT COALESCE(sum(cydex_from_rider), 0) FROM delivered),
      'from_withdrawals', (SELECT COALESCE(sum(fee), 0) FROM payout_fees),
      'withdrawals_paid', (SELECT count(*) FROM payout_fees),
      'total', (SELECT COALESCE(sum(cydex_total), 0) FROM delivered) + (SELECT COALESCE(sum(fee), 0) FROM payout_fees),
      'paid_to_vendors', (SELECT COALESCE(sum(vendor_got), 0) FROM delivered),
      'paid_to_riders', (SELECT COALESCE(sum(rider_got), 0) FROM delivered)
    ),
    -- right now (not tied to the period)
    'orders_today', (SELECT count(*) FROM public.orders o LEFT JOIN public.payment_holds h ON h.order_id = o.id
                     WHERE o.payment_status IN ('paid', 'refunded') AND COALESCE(h.created_at, o.created_at) >= date_trunc('day', now())),
    'active_deliveries', (SELECT count(*) FROM public.orders WHERE status IN ('rider_assigned', 'picking_up', 'out_for_delivery', 'arrived')),
    'awaiting_rider', (SELECT count(*) FROM public.orders WHERE status = 'ready_for_pickup' AND rider_id IS NULL),
    'online_riders', (SELECT count(*) FROM public.rider_profiles rp WHERE rp.rider_status = 'available' AND public.is_verified_rider(rp.id)),
    'pending_verifications', (SELECT count(*) FROM public.verifications WHERE status = 'pending'),
    'pending_payouts', (
      SELECT jsonb_build_object('count', count(*), 'amount', COALESCE(sum(amount), 0)) FROM (
        SELECT amount FROM public.vendor_payout_requests WHERE status = 'pending'
        UNION ALL SELECT amount FROM public.rider_payout_requests WHERE status = 'pending'
        UNION ALL SELECT amount FROM public.customer_withdrawal_requests WHERE status = 'pending'
      ) x
    ),
    'held_funds', (SELECT COALESCE(sum(total_amount), 0) FROM public.payment_holds WHERE status = 'held'),
    'failed_emails', (SELECT count(*) FROM public.email_outbox WHERE status = 'failed'),
    'series', (
      SELECT jsonb_agg(jsonb_build_object(
        'period', bk.b,
        'transactions', (SELECT COALESCE(sum(total_amount), 0) FROM paid p WHERE date_trunc(v_bucket, p.paid_at) = bk.b),
        'orders', (SELECT count(*) FROM paid p WHERE date_trunc(v_bucket, p.paid_at) = bk.b),
        'revenue', (SELECT COALESCE(sum(cydex_total), 0) FROM delivered d WHERE date_trunc(v_bucket, d.delivered_at) = bk.b)
                 + (SELECT COALESCE(sum(fee), 0) FROM payout_fees pf WHERE date_trunc(v_bucket, pf.processed_at) = bk.b)
      ) ORDER BY bk.b)
      FROM buckets bk
    )
  ) INTO v;
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reassign_order(p_order_id uuid, p_rider_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders%ROWTYPE;
  v_reason TEXT := NULLIF(trim(p_reason), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can reassign orders';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Give a reason';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.status NOT IN ('ready_for_pickup', 'rider_assigned', 'picking_up') THEN
    RAISE EXCEPTION 'Only orders waiting for or heading to pickup can be reassigned';
  END IF;
  IF p_rider_id IS NOT DISTINCT FROM o.rider_id THEN
    RAISE EXCEPTION 'That rider already has this order';
  END IF;
  IF NOT public.is_verified_rider(p_rider_id) THEN
    RAISE EXCEPTION 'Choose a verified rider';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE rider_id = p_rider_id
             AND status IN ('rider_assigned', 'picking_up', 'out_for_delivery', 'arrived')) THEN
    RAISE EXCEPTION 'That rider is already on a delivery';
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);
  UPDATE public.orders
  SET rider_id = p_rider_id, status = 'rider_assigned', rider_assigned_at = now(), pickup_started_at = NULL,
      dispatch_priority = 0
  WHERE id = o.id;
  UPDATE public.deliveries
  SET rider_id = p_rider_id, status = 'accepted', accepted_at = now(), picking_up_at = NULL
  WHERE order_id = o.id;
  PERFORM public.replace_pickup_code(o.id);

  IF o.rider_id IS NOT NULL THEN
    PERFORM public.notify_user(o.rider_id, 'relieved', 'Removed from an order',
      'An admin moved order #' || o.order_number || ' to another rider: ' || v_reason, o);
    -- The status didn't change, so tell the customer about their new rider here
    PERFORM public.notify_user(o.customer_id, 'rider_assigned', 'New rider',
      'A different rider is now handling order #' || o.order_number || '.', o);
  END IF;
  PERFORM public.notify_user(p_rider_id, 'assigned_by_admin', 'New delivery assigned',
    'An admin assigned you order #' || o.order_number || '. Head to the vendor when you''re ready.', o);
  PERFORM public.log_admin_action('reassign_order', 'order', o.id::text, jsonb_build_object('rider_id', o.rider_id, 'status', o.status), jsonb_build_object('rider_id', p_rider_id, 'reason', v_reason));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_rider_candidates(p_order_id uuid)
 RETURNS TABLE(rider_id uuid, name text, phone text, online boolean, distance_km numeric, busy boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can list riders';
  END IF;
  RETURN QUERY
  WITH pickup AS (
    SELECT (d.pickup_location ->> 'latitude')::float8 AS lat, (d.pickup_location ->> 'longitude')::float8 AS lng
    FROM public.deliveries d WHERE d.order_id = p_order_id LIMIT 1
  )
  SELECT p.id, p.name, p.phone,
         rp.rider_status::text = 'available',
         CASE WHEN rp.current_location ? 'latitude' AND (SELECT lat FROM pickup) IS NOT NULL THEN
           round((public.distance_m((rp.current_location ->> 'latitude')::float8, (rp.current_location ->> 'longitude')::float8,
                                    (SELECT lat FROM pickup), (SELECT lng FROM pickup)) / 1000)::numeric, 1)
         END,
         EXISTS (SELECT 1 FROM public.orders x WHERE x.rider_id = p.id
                 AND x.status IN ('rider_assigned', 'picking_up', 'out_for_delivery', 'arrived'))
  FROM public.verifications v
  JOIN public.profiles p ON p.id = v.profile_id
  LEFT JOIN public.rider_profiles rp ON rp.id = p.id
  WHERE v.role = 'rider' AND v.status = 'verified'
  ORDER BY 6, 4 DESC, 5 NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_orders_needing_attention()
 RETURNS TABLE(order_id uuid, order_number text, order_type text, status text, reason text, since timestamp with time zone, vendor_name text, rider_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT o.id, o.order_number, o.order_type, o.status, x.reason, x.since, v.name, r.name
  FROM public.orders o
  CROSS JOIN LATERAL (
    SELECT * FROM (VALUES
      (o.status = 'pending' AND o.payment_status = 'paid'
         AND COALESCE((SELECT h.created_at FROM public.payment_holds h WHERE h.order_id = o.id), o.created_at) < now() - interval '15 minutes',
       'Vendor hasn''t accepted', COALESCE((SELECT h.created_at FROM public.payment_holds h WHERE h.order_id = o.id), o.created_at)),
      (o.status = 'accepted' AND o.vendor_accepted_at < now() - interval '45 minutes',
       'Not marked ready', o.vendor_accepted_at),
      (o.status = 'ready_for_pickup' AND o.rider_id IS NULL AND o.ready_for_pickup_at < now() - interval '20 minutes',
       'No rider yet', o.ready_for_pickup_at),
      (o.status = 'rider_assigned' AND o.rider_assigned_at < now() - interval '30 minutes',
       'Rider hasn''t set off', o.rider_assigned_at),
      (o.status = 'picking_up' AND o.pickup_started_at < now() - interval '45 minutes',
       'Rider hasn''t collected it', o.pickup_started_at),
      (o.status = 'out_for_delivery' AND o.picked_up_at < now() - interval '60 minutes',
       'Delivery is taking long', o.picked_up_at),
      (o.status = 'arrived' AND o.arrived_at < now() - interval '15 minutes',
       'Rider waiting at the drop-off', o.arrived_at),
      (EXISTS (SELECT 1 FROM public.order_handover_codes c WHERE c.order_id = o.id AND c.failed_attempts >= 5 AND c.used_at IS NULL)
         AND o.status NOT IN ('delivered', 'cancelled', 'rejected'),
       'Handover code locked', o.updated_at)
    ) AS t(hit, reason, since)
    WHERE t.hit
  ) x
  LEFT JOIN public.profiles v ON v.id = o.vendor_id
  LEFT JOIN public.profiles r ON r.id = o.rider_id
  ORDER BY x.since;
END;
$function$;
