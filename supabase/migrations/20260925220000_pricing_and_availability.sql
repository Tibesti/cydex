-- ===================================================================
-- Pricing, customer delivery radius, and rider online status
-- See docs/PRICING_MODEL_IMPLEMENTATION_PLAN.md
--
--   delivery fee   = ₦600 + ₦200 × straight-line km (vendor store → delivery address)
--   service charge = 15% of the items subtotal (shown to customers as an amount only)
--   total          = subtotal + service charge + delivery fee
--
-- Prices are calculated here, not in the browser, and can't be edited later.
-- Customers can only order from (and only see) vendors within 5 km.
-- Riders are online while their live location is fresh, offline otherwise.
-- ===================================================================

-- ===================================================================
-- 1. Pricing settings
-- ===================================================================

ALTER TABLE public.pricing_config
  ADD COLUMN IF NOT EXISTS service_charge_rate DECIMAL(5,4) DEFAULT 0.15;

ALTER TABLE public.pricing_config ALTER COLUMN base_rate SET DEFAULT 600.00;
ALTER TABLE public.pricing_config ALTER COLUMN distance_rate_per_km SET DEFAULT 200.00;

UPDATE public.pricing_config
SET base_rate = 600.00, distance_rate_per_km = 200.00, service_charge_rate = 0.15;

INSERT INTO public.pricing_config (base_rate, distance_rate_per_km, service_charge_rate)
SELECT 600.00, 200.00, 0.15
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_config);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge DECIMAL(12,2) DEFAULT 0;

-- ===================================================================
-- 2. Customer delivery radius
-- ===================================================================

-- Customers see and can order from vendors whose store is within this distance
-- (straight line) of their delivery address. Riders have their own radius:
-- rider_order_radius_m().
CREATE OR REPLACE FUNCTION public.customer_vendor_radius_m()
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 5000::double precision;
$$;

-- ===================================================================
-- 3. Price calculation (shared by the checkout quote and the order trigger)
-- ===================================================================

-- status: ok | no_address | no_store | out_of_range
CREATE OR REPLACE FUNCTION public.calculate_order_price(
  p_vendor_id UUID,
  p_address_id UUID,
  p_subtotal NUMERIC,
  OUT status TEXT,
  OUT distance_km NUMERIC,
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
  -- Exact price from the distance to the nearest 10 m, so the breakdown adds up
  distance_km := round((v_distance_m / 1000)::numeric, 2);
  base_rate := COALESCE(v_config.base_rate, 600);
  distance_fee := round(distance_km * COALESCE(v_config.distance_rate_per_km, 200), 2);
  delivery_fee := base_rate + distance_fee;
  total_amount := COALESCE(p_subtotal, 0) + service_charge + delivery_fee;
  status := CASE WHEN v_distance_m <= public.customer_vendor_radius_m() THEN 'ok' ELSE 'out_of_range' END;
END;
$$;

-- Internal: only the functions below (and triggers) use it
REVOKE EXECUTE ON FUNCTION public.calculate_order_price(UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;

-- Checkout quote for the logged-in customer's own address
CREATE OR REPLACE FUNCTION public.quote_order(p_vendor_id UUID, p_address_id UUID, p_subtotal NUMERIC)
RETURNS TABLE (
  status TEXT,
  distance_km NUMERIC,
  base_rate NUMERIC,
  distance_fee NUMERIC,
  delivery_fee NUMERIC,
  service_charge NUMERIC,
  total_amount NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.status, p.distance_km, p.base_rate, p.distance_fee, p.delivery_fee, p.service_charge, p.total_amount
  FROM public.calculate_order_price(
    p_vendor_id,
    (SELECT a.id FROM public.addresses a WHERE a.id = p_address_id AND a.profile_id = auth.uid()),
    p_subtotal
  ) p;
$$;

REVOKE EXECUTE ON FUNCTION public.quote_order(UUID, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_order(UUID, UUID, NUMERIC) TO authenticated;

-- Vendors within the customer radius of one of the caller's addresses,
-- nearest first. Returns distances only, never the vendors' coordinates.
CREATE OR REPLACE FUNCTION public.vendors_near_address(p_address_id UUID)
RETURNS TABLE (vendor_id UUID, distance_km NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dest AS (
    SELECT latitude, longitude FROM public.addresses
    WHERE id = p_address_id AND profile_id = auth.uid()
  ),
  stores AS (
    SELECT DISTINCT ON (a.profile_id) a.profile_id, a.latitude, a.longitude
    FROM public.addresses a
    JOIN public.profiles p ON p.id = a.profile_id AND lower(p.role) = 'vendor'
    ORDER BY a.profile_id, a.is_default DESC, a.created_at DESC
  )
  SELECT s.profile_id,
         round((public.distance_m(s.latitude, s.longitude, d.latitude, d.longitude) / 1000)::numeric, 2)
  FROM stores s CROSS JOIN dest d
  WHERE public.distance_m(s.latitude, s.longitude, d.latitude, d.longitude) <= public.customer_vendor_radius_m()
  ORDER BY 2;
$$;

REVOKE EXECUTE ON FUNCTION public.vendors_near_address(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendors_near_address(UUID) TO authenticated;

-- ===================================================================
-- 4. Price every new order in the database
-- ===================================================================

CREATE OR REPLACE FUNCTION public.price_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price RECORD;
BEGIN
  IF NEW.delivery_type = 'pickup' THEN
    -- Customer collects from the store: no delivery fee
    SELECT * INTO v_price FROM public.calculate_order_price(NEW.vendor_id, NULL, NEW.subtotal);
    NEW.distance_km := NULL;
    NEW.base_rate := NULL;
    NEW.distance_fee := NULL;
    NEW.delivery_fee := 0;
    NEW.service_charge := v_price.service_charge;
    NEW.total_amount := COALESCE(NEW.subtotal, 0) + v_price.service_charge;
    RETURN NEW;
  END IF;

  IF NEW.delivery_address_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = NEW.delivery_address_id AND profile_id = NEW.customer_id) THEN
    RAISE EXCEPTION 'Choose one of your saved delivery addresses';
  END IF;

  SELECT * INTO v_price FROM public.calculate_order_price(NEW.vendor_id, NEW.delivery_address_id, NEW.subtotal);

  IF v_price.status = 'no_store' THEN
    RAISE EXCEPTION 'This vendor has not set a store location yet, so it can''t take delivery orders';
  ELSIF v_price.status = 'out_of_range' THEN
    RAISE EXCEPTION 'This vendor is more than 5 km from your delivery address';
  END IF;

  NEW.distance_km := v_price.distance_km;
  NEW.base_rate := v_price.base_rate;
  NEW.distance_fee := v_price.distance_fee;
  NEW.delivery_fee := v_price.delivery_fee;
  NEW.service_charge := v_price.service_charge;
  NEW.total_amount := v_price.total_amount;
  RETURN NEW;
END;
$$;

CREATE TRIGGER price_new_order
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.price_new_order();

-- Prices can't be changed after the order is created (except by admins or
-- server-side jobs). Status, payment and assignment updates are unaffected.
-- delivery_address_id may only be cleared: that happens when the customer
-- deletes the saved address (ON DELETE SET NULL); the order keeps its copy.
CREATE OR REPLACE FUNCTION public.protect_order_prices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND (
       NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
    OR NEW.service_charge IS DISTINCT FROM OLD.service_charge
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.distance_km IS DISTINCT FROM OLD.distance_km
    OR NEW.base_rate IS DISTINCT FROM OLD.base_rate
    OR NEW.distance_fee IS DISTINCT FROM OLD.distance_fee
    OR (NEW.delivery_address_id IS DISTINCT FROM OLD.delivery_address_id AND NEW.delivery_address_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Order prices and delivery address can''t be changed after the order is placed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_order_prices
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_order_prices();

-- ===================================================================
-- 5. Rider online status follows their live location
--   - the rider app sets rider_status = 'available' each time it saves the
--     location (and re-saves it every minute while open)
--   - this job marks riders offline once their location is 2+ minutes old
-- ===================================================================

CREATE OR REPLACE FUNCTION public.mark_stale_riders_offline()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.rider_profiles
  SET rider_status = 'offline'
  WHERE rider_status IS DISTINCT FROM 'offline'
    AND (
      current_location IS NULL
      OR NOT (current_location ? 'updated_at')
      OR (current_location ->> 'updated_at')::timestamptz < now() - interval '2 minutes'
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_stale_riders_offline() FROM PUBLIC, anon, authenticated;

-- Run every minute with pg_cron (available on Supabase; skipped where it isn't)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    PERFORM cron.schedule(
      'mark-stale-riders-offline',
      '* * * * *',
      'SELECT public.mark_stale_riders_offline()'
    );
  END IF;
END $$;
