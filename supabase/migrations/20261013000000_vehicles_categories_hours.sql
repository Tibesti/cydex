-- ===================================================================
-- Foundations for the October 2026 update
--   1. Vehicle types managed by admins (Walking shows to customers as
--      "Cydex Dashers"), each with its own price per km, and rider vehicle
--      verification. Delivery fee = km x the vehicle's price per km + a flat
--      charge (pricing_config.base_rate, now 500): no minimum fare any more.
--   2. Product categories per business category
--   3. Vendor preparation time and opening hours (customers can't order
--      while a vendor is closed)
--   4. Riders who are online but idle are set offline until they open the
--      app again (the idle time is an admin setting)
-- See docs/ORDER_FLOW.md and docs/ADMIN.md.
-- ===================================================================

-- ===================================================================
-- 1. Vehicle types
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.vehicle_types (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- What customers see when choosing a delivery mode (defaults to name)
  customer_label TEXT,
  -- Riders must give the colour and a photo of the vehicle
  needs_details BOOLEAN NOT NULL DEFAULT true,
  -- ...and its registration number and registration document
  needs_registration BOOLEAN NOT NULL DEFAULT false,
  -- Delivery fee = distance x this + the flat charge (pricing_config.base_rate)
  rate_per_km NUMERIC(10,2) NOT NULL DEFAULT 200 CHECK (rate_per_km >= 0),
  -- Used for delivery time estimates until there are enough real deliveries
  avg_speed_kmh NUMERIC(5,1) NOT NULL DEFAULT 15 CHECK (avg_speed_kmh > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can see vehicle types" ON public.vehicle_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage vehicle types" ON public.vehicle_types
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Every type starts at the old ₦200 per km; admins set each one's price
INSERT INTO public.vehicle_types (key, name, customer_label, needs_details, needs_registration, rate_per_km, avg_speed_kmh, is_active, sort_order) VALUES
  ('walking', 'Walking', 'Cydex Dashers', false, false, 200, 5, true, 1),
  ('bicycle', 'Bicycle', NULL, true, false, 200, 15, true, 2),
  ('petrol_bike', 'Petrol bike', NULL, true, true, 200, 30, true, 3),
  ('electric_bike', 'Electric bike', NULL, true, true, 200, 25, true, 4),
  -- Kept for riders who registered a car before; admins can switch it back on
  ('car', 'Car', NULL, true, true, 200, 30, false, 5)
ON CONFLICT (key) DO NOTHING;

-- Admin: add or edit a vehicle type (key is made from the name for new ones)
CREATE OR REPLACE FUNCTION public.admin_save_vehicle_type(
  p_key TEXT,
  p_name TEXT,
  p_customer_label TEXT,
  p_rate_per_km NUMERIC,
  p_avg_speed_kmh NUMERIC,
  p_needs_details BOOLEAN,
  p_needs_registration BOOLEAN,
  p_is_active BOOLEAN
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

  IF v_key IS NULL THEN
    v_key := trim(both '_' from regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'));
    IF v_key = '' OR EXISTS (SELECT 1 FROM public.vehicle_types WHERE key = v_key OR lower(name) = lower(v_name)) THEN
      RAISE EXCEPTION 'A vehicle type with that name already exists';
    END IF;
    INSERT INTO public.vehicle_types (key, name, customer_label, rate_per_km, avg_speed_kmh, needs_details,
                                      needs_registration, is_active, sort_order)
    VALUES (v_key, v_name, NULLIF(trim(p_customer_label), ''), p_rate_per_km, p_avg_speed_kmh,
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
        avg_speed_kmh = p_avg_speed_kmh, needs_details = COALESCE(p_needs_details, needs_details),
        needs_registration = COALESCE(p_needs_registration, needs_registration),
        is_active = COALESCE(p_is_active, is_active)
    WHERE key = v_key;
  END IF;

  PERFORM public.log_admin_action('save_vehicle_type', 'vehicle_type', v_key, v_old,
    (SELECT to_jsonb(t) FROM public.vehicle_types t WHERE key = v_key));
  RETURN v_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_save_vehicle_type(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_vehicle_type(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- The delivery mode used when nobody chose one: Bicycle, else the first active type
CREATE OR REPLACE FUNCTION public.default_vehicle_type()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT key FROM public.vehicle_types WHERE is_active ORDER BY (key = 'bicycle') DESC, sort_order, key LIMIT 1;
$$;

-- Delivery fee for a distance and vehicle type:
--   distance_fee = km x the vehicle's price per km
--   delivery_fee = distance_fee + the flat charge (pricing_config.base_rate)
CREATE OR REPLACE FUNCTION public.delivery_fee_for(
  p_distance_km NUMERIC,
  p_vehicle_type TEXT,
  OUT vehicle_type TEXT,
  OUT rate_per_km NUMERIC,
  OUT base_rate NUMERIC,
  OUT distance_fee NUMERIC,
  OUT delivery_fee NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT t.key, t.rate_per_km INTO vehicle_type, rate_per_km
  FROM public.vehicle_types t
  WHERE t.key = COALESCE(p_vehicle_type, public.default_vehicle_type());
  IF vehicle_type IS NULL THEN
    SELECT t.key, t.rate_per_km INTO vehicle_type, rate_per_km
    FROM public.vehicle_types t WHERE t.key = public.default_vehicle_type();
  END IF;
  SELECT COALESCE(c.base_rate, 500) INTO base_rate FROM public.pricing_config c ORDER BY c.created_at DESC LIMIT 1;
  base_rate := COALESCE(base_rate, 500);
  rate_per_km := COALESCE(rate_per_km, 200);
  distance_fee := round(COALESCE(p_distance_km, 0) * rate_per_km, 2);
  delivery_fee := distance_fee + base_rate;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delivery_fee_for(NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_fee_for(NUMERIC, TEXT) TO authenticated;

-- The flat charge is ₦500 from now on (a new pricing row, so the history shows the change)
INSERT INTO public.pricing_config (
  base_rate, distance_rate_per_km, weight_rates, late_night_fee, surge_multiplier, student_discount_percent,
  green_fee, subscription_monthly_rate, service_charge_rate, rider_share_rate, vendor_commission_rate,
  rider_request_commission_rate, note, created_at
)
SELECT 500, c.distance_rate_per_km, c.weight_rates, c.late_night_fee, c.surge_multiplier, c.student_discount_percent,
       c.green_fee, c.subscription_monthly_rate, c.service_charge_rate, c.rider_share_rate, c.vendor_commission_rate,
       c.rider_request_commission_rate,
       'Delivery fee is now distance x the vehicle''s price per km + this ₦500 charge (no minimum fare)',
       clock_timestamp()
FROM (SELECT * FROM public.pricing_config ORDER BY created_at DESC LIMIT 1) c
WHERE c.base_rate IS DISTINCT FROM 500;

-- The fixed list on verifications becomes the admin-managed table
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.verifications'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%vehicle_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.verifications DROP CONSTRAINT %I', c.conname);
  END LOOP;
END;
$$;

UPDATE public.verifications SET vehicle_type = 'petrol_bike' WHERE vehicle_type = 'motorcycle';
UPDATE public.rider_profiles SET vehicle_type = 'petrol_bike' WHERE vehicle_type = 'motorcycle';

ALTER TABLE public.verifications
  ADD CONSTRAINT verifications_vehicle_type_fkey
  FOREIGN KEY (vehicle_type) REFERENCES public.vehicle_types(key) ON UPDATE CASCADE;

ALTER TABLE public.verifications ADD COLUMN IF NOT EXISTS vehicle_photo_path TEXT;
ALTER TABLE public.verifications ADD COLUMN IF NOT EXISTS vehicle_registration_doc_path TEXT;

-- Rider onboarding: phone, vehicle (type from the admin's list; details and
-- registration only where that type needs them) and ID. Replaces the version
-- that asked for model and year.
DROP FUNCTION IF EXISTS public.submit_rider_onboarding(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_rider_onboarding(
  p_phone TEXT,
  p_vehicle_type TEXT,
  p_vehicle_color TEXT,
  p_vehicle_photo_path TEXT,
  p_vehicle_registration TEXT,
  p_registration_doc_path TEXT,
  p_id_document_type TEXT,
  p_id_document_path TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_prev public.verifications%ROWTYPE;
  v_type public.vehicle_types%ROWTYPE;
  v_mine TEXT := auth.uid()::text;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'rider' THEN
    RAISE EXCEPTION 'Only riders can submit rider onboarding';
  END IF;
  SELECT * INTO v_prev FROM public.verifications WHERE profile_id = v_uid FOR UPDATE;
  IF v_prev.status = 'suspended' THEN
    RAISE EXCEPTION 'Your account is suspended';
  END IF;

  IF NOT public.is_valid_phone(p_phone) THEN
    RAISE EXCEPTION 'Enter a valid phone number';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.addresses WHERE profile_id = v_uid) THEN
    RAISE EXCEPTION 'Add your address';
  END IF;

  SELECT * INTO v_type FROM public.vehicle_types WHERE key = p_vehicle_type;
  -- A type that was switched off can be kept by riders who already have it
  IF v_type.key IS NULL OR (NOT v_type.is_active AND v_prev.vehicle_type IS DISTINCT FROM v_type.key) THEN
    RAISE EXCEPTION 'Choose how you deliver';
  END IF;
  IF v_type.needs_details THEN
    IF NULLIF(trim(p_vehicle_color), '') IS NULL THEN
      RAISE EXCEPTION 'Enter your vehicle''s colour';
    END IF;
    IF NULLIF(p_vehicle_photo_path, '') IS NULL OR split_part(p_vehicle_photo_path, '/', 1) <> v_mine THEN
      RAISE EXCEPTION 'Upload a photo of your vehicle';
    END IF;
  END IF;
  IF v_type.needs_registration THEN
    IF NULLIF(trim(p_vehicle_registration), '') IS NULL THEN
      RAISE EXCEPTION 'Enter your vehicle''s registration number';
    END IF;
    IF NULLIF(p_registration_doc_path, '') IS NULL OR split_part(p_registration_doc_path, '/', 1) <> v_mine THEN
      RAISE EXCEPTION 'Upload your vehicle registration document';
    END IF;
  END IF;

  IF p_id_document_type IS NULL OR p_id_document_type NOT IN ('national_id', 'passport', 'voters_card', 'drivers_license') THEN
    RAISE EXCEPTION 'Choose your ID type';
  END IF;
  IF NULLIF(p_id_document_path, '') IS NULL OR split_part(p_id_document_path, '/', 1) <> v_mine THEN
    RAISE EXCEPTION 'Upload your ID document';
  END IF;

  UPDATE public.profiles SET phone = trim(p_phone) WHERE id = v_uid;
  INSERT INTO public.rider_profiles (id) VALUES (v_uid) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.verifications (
    profile_id, role, status, vehicle_type, vehicle_model, vehicle_year, vehicle_color, vehicle_photo_path,
    vehicle_registration, vehicle_registration_doc_path, id_document_type, id_document_path,
    rejection_reason, submitted_at, updated_at
  ) VALUES (
    v_uid, 'rider', 'pending', v_type.key, NULL, NULL,
    CASE WHEN v_type.needs_details THEN trim(p_vehicle_color) END,
    CASE WHEN v_type.needs_details THEN p_vehicle_photo_path END,
    CASE WHEN v_type.needs_registration THEN trim(p_vehicle_registration) END,
    CASE WHEN v_type.needs_registration THEN p_registration_doc_path END,
    p_id_document_type, p_id_document_path, NULL, now(), now()
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    status = 'pending',
    vehicle_type = EXCLUDED.vehicle_type,
    vehicle_model = NULL,
    vehicle_year = NULL,
    vehicle_color = EXCLUDED.vehicle_color,
    vehicle_photo_path = EXCLUDED.vehicle_photo_path,
    vehicle_registration = EXCLUDED.vehicle_registration,
    vehicle_registration_doc_path = EXCLUDED.vehicle_registration_doc_path,
    id_document_type = EXCLUDED.id_document_type,
    id_document_path = EXCLUDED.id_document_path,
    rejection_reason = NULL,
    submitted_at = now(),
    updated_at = now();

  PERFORM public.notify_admins('verification_request', 'Rider to verify',
    COALESCE((SELECT name FROM public.profiles WHERE id = v_uid), 'A rider') || ' submitted their details for verification.');
  RETURN 'pending';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_rider_onboarding(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_rider_onboarding(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- The verification sync cleared the registration on rider_profiles when a
-- rider switched to a type without one; keep them in step
CREATE OR REPLACE FUNCTION public.sync_verification_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('cydex.profile_sync', 'on', true);
  UPDATE public.profiles SET verified = (NEW.status = 'verified') WHERE id = NEW.profile_id;
  PERFORM set_config('cydex.profile_sync', 'off', true);
  IF NEW.role = 'rider' THEN
    UPDATE public.rider_profiles
    SET is_verified = (NEW.status = 'verified'), verification_status = NEW.status,
        vehicle_type = COALESCE(NEW.vehicle_type, vehicle_type),
        vehicle_registration = NEW.vehicle_registration,
        updated_at = now()
    WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ===================================================================
-- 2. Product categories (per business category)
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_category_id UUID NOT NULL REFERENCES public.business_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_category_id, name)
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can see product categories" ON public.product_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage product categories" ON public.product_categories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.business_categories (name) SELECT 'Shop'
WHERE NOT EXISTS (SELECT 1 FROM public.business_categories WHERE lower(name) = 'shop');

INSERT INTO public.product_categories (business_category_id, name, sort_order)
SELECT bc.id, x.name, x.ord
FROM public.business_categories bc
JOIN LATERAL unnest(ARRAY[
  'Main meals', 'Drinks', 'Sides & extras', 'Swallows', 'Proteins', 'Breakfast', 'Lunch', 'Dinner', 'Grills',
  'Combos & meal deals', 'Pasta & noodles', 'Rice dishes', 'Soups'
]) WITH ORDINALITY AS x(name, ord) ON true
WHERE lower(bc.name) = 'restaurant'
ON CONFLICT (business_category_id, name) DO NOTHING;

INSERT INTO public.product_categories (business_category_id, name, sort_order)
SELECT bc.id, x.name, x.ord
FROM public.business_categories bc
JOIN LATERAL unnest(ARRAY[
  'Groceries & staples', 'Breakfast & beverages', 'Snacks & biscuits', 'Drinks', 'Electronics & accessories',
  'Clothings', 'Household & cleaning', 'Stationery'
]) WITH ORDINALITY AS x(name, ord) ON true
WHERE lower(bc.name) = 'shop'
ON CONFLICT (business_category_id, name) DO NOTHING;

-- A business category always starts with at least one product category
CREATE OR REPLACE FUNCTION public.admin_create_business_category(p_name TEXT, p_product_categories TEXT[])
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT := NULLIF(trim(p_name), '');
  v_products TEXT[];
  v_id UUID;
BEGIN
  PERFORM public.require_admin();
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Enter the category name';
  END IF;
  SELECT array_agg(DISTINCT trim(x)) INTO v_products FROM unnest(COALESCE(p_product_categories, '{}')) x WHERE trim(x) <> '';
  IF v_products IS NULL OR array_length(v_products, 1) < 1 THEN
    RAISE EXCEPTION 'Add at least one product category';
  END IF;
  IF EXISTS (SELECT 1 FROM public.business_categories WHERE lower(name) = lower(v_name)) THEN
    RAISE EXCEPTION 'That business category already exists';
  END IF;

  INSERT INTO public.business_categories (name) VALUES (v_name) RETURNING id INTO v_id;
  INSERT INTO public.product_categories (business_category_id, name, sort_order)
  SELECT v_id, x.name, x.ord FROM unnest(v_products) WITH ORDINALITY AS x(name, ord);
  PERFORM public.log_admin_action('create_business_category', 'business_category', v_id::text, NULL,
    jsonb_build_object('name', v_name, 'product_categories', v_products));
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_business_category(TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_business_category(TEXT, TEXT[]) TO authenticated;

-- The last active product category of a business category can't be removed
CREATE OR REPLACE FUNCTION public.keep_one_product_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.is_active AND NOT NEW.is_active))
     AND EXISTS (SELECT 1 FROM public.business_categories WHERE id = OLD.business_category_id)
     AND NOT EXISTS (SELECT 1 FROM public.product_categories
                     WHERE business_category_id = OLD.business_category_id AND is_active AND id <> OLD.id) THEN
    RAISE EXCEPTION 'A business category needs at least one product category';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER keep_one_product_category
  BEFORE UPDATE OR DELETE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.keep_one_product_category();

-- ===================================================================
-- 3. Vendor preparation time and opening hours
--    opening_hours: {"mon": {"open": "08:00", "close": "20:00"}, "sun": null, ...}
--    (a day that is null or missing is closed). Times are Nigerian time.
--    A vendor who hasn't set hours yet is treated as open.
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.vendor_hours (
  vendor_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  prep_time_minutes INTEGER NOT NULL DEFAULT 15 CHECK (prep_time_minutes BETWEEN 0 AND 240),
  opening_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can see vendor hours" ON public.vendor_hours
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage vendor hours" ON public.vendor_hours
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_vendor_hours(p_prep_time_minutes INTEGER, p_opening_hours JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d TEXT;
  v_day JSONB;
  v_any BOOLEAN := false;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'vendor' THEN
    RAISE EXCEPTION 'Only vendors can set store hours';
  END IF;
  IF p_prep_time_minutes IS NULL OR p_prep_time_minutes < 0 OR p_prep_time_minutes > 240 THEN
    RAISE EXCEPTION 'Preparation time must be between 0 and 240 minutes';
  END IF;
  IF p_opening_hours IS NULL OR jsonb_typeof(p_opening_hours) <> 'object' THEN
    RAISE EXCEPTION 'Set your opening hours';
  END IF;
  FOREACH d IN ARRAY ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] LOOP
    v_day := p_opening_hours -> d;
    IF v_day IS NULL OR jsonb_typeof(v_day) = 'null' THEN
      CONTINUE;
    END IF;
    IF (v_day ->> 'open') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (v_day ->> 'close') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Enter opening and closing times for each open day';
    END IF;
    IF (v_day ->> 'open') = (v_day ->> 'close') THEN
      RAISE EXCEPTION 'Opening and closing times can''t be the same';
    END IF;
    v_any := true;
  END LOOP;
  IF NOT v_any THEN
    RAISE EXCEPTION 'Choose at least one day you''re open';
  END IF;

  INSERT INTO public.vendor_hours (vendor_id, prep_time_minutes, opening_hours, updated_at)
  VALUES (auth.uid(), p_prep_time_minutes, p_opening_hours, now())
  ON CONFLICT (vendor_id) DO UPDATE
  SET prep_time_minutes = EXCLUDED.prep_time_minutes, opening_hours = EXCLUDED.opening_hours, updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_vendor_hours(INTEGER, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_vendor_hours(INTEGER, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.vendor_is_open(p_vendor_id UUID, p_at TIMESTAMPTZ DEFAULT now())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours JSONB;
  v_local TIMESTAMP := p_at AT TIME ZONE 'Africa/Lagos';
  v_days TEXT[] := ARRAY['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  v_today JSONB;
  v_yesterday JSONB;
  v_now TIME := v_local::time;
BEGIN
  SELECT opening_hours INTO v_hours FROM public.vendor_hours WHERE vendor_id = p_vendor_id;
  IF v_hours IS NULL OR v_hours = '{}'::jsonb THEN
    RETURN true; -- hours not set yet
  END IF;
  v_today := v_hours -> v_days[extract(dow FROM v_local)::int + 1];
  v_yesterday := v_hours -> v_days[(extract(dow FROM v_local)::int + 6) % 7 + 1];

  -- Still inside yesterday's hours when they run past midnight (e.g. 18:00-02:00)
  IF v_yesterday IS NOT NULL AND jsonb_typeof(v_yesterday) = 'object'
     AND (v_yesterday ->> 'close')::time < (v_yesterday ->> 'open')::time
     AND v_now < (v_yesterday ->> 'close')::time THEN
    RETURN true;
  END IF;
  IF v_today IS NULL OR jsonb_typeof(v_today) <> 'object' THEN
    RETURN false;
  END IF;
  IF (v_today ->> 'close')::time > (v_today ->> 'open')::time THEN
    RETURN v_now >= (v_today ->> 'open')::time AND v_now < (v_today ->> 'close')::time;
  END IF;
  RETURN v_now >= (v_today ->> 'open')::time; -- closes after midnight
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vendor_is_open(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_is_open(UUID, TIMESTAMPTZ) TO authenticated;

-- For vendor lists and store pages: open now, today's hours, preparation time
CREATE OR REPLACE FUNCTION public.vendor_hours_info(p_vendor_ids UUID[])
RETURNS TABLE (
  vendor_id UUID,
  is_open BOOLEAN,
  hours_set BOOLEAN,
  prep_time_minutes INTEGER,
  today_open TEXT,
  today_close TEXT,
  opening_hours JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id,
         public.vendor_is_open(v.id),
         (h.opening_hours IS NOT NULL AND h.opening_hours <> '{}'::jsonb),
         COALESCE(h.prep_time_minutes, 15),
         h.opening_hours -> d.key ->> 'open',
         h.opening_hours -> d.key ->> 'close',
         COALESCE(h.opening_hours, '{}'::jsonb)
  FROM unnest(p_vendor_ids) AS v(id)
  LEFT JOIN public.vendor_hours h ON h.vendor_id = v.id
  CROSS JOIN LATERAL (
    SELECT (ARRAY['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow FROM now() AT TIME ZONE 'Africa/Lagos')::int + 1] AS key
  ) d;
$$;

REVOKE EXECUTE ON FUNCTION public.vendor_hours_info(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_hours_info(UUID[]) TO authenticated;

-- ===================================================================
-- 4. Idle riders go offline until they open the app again
--    The app's location heartbeat keeps marking a rider 'available', so an
--    auto-offline rider stays offline (auto_offline_at set) until
--    rider_app_opened() clears it.
-- ===================================================================

INSERT INTO public.app_config (key, value) VALUES ('rider_idle_minutes', '30')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.rider_profiles ADD COLUMN IF NOT EXISTS online_since TIMESTAMPTZ;
ALTER TABLE public.rider_profiles ADD COLUMN IF NOT EXISTS auto_offline_at TIMESTAMPTZ;

UPDATE public.rider_profiles SET online_since = now() WHERE rider_status = 'available' AND online_since IS NULL;

CREATE OR REPLACE FUNCTION public.track_rider_online()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system BOOLEAN := auth.uid() IS NULL OR COALESCE(current_setting('cydex.rider_resume', true), 'off') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.auto_offline_at := NULL;
    NEW.online_since := CASE WHEN NEW.rider_status = 'available' THEN now() END;
    RETURN NEW;
  END IF;

  IF NOT v_system THEN
    -- Only the database sets these
    NEW.online_since := OLD.online_since;
    NEW.auto_offline_at := OLD.auto_offline_at;
    -- Set offline for being idle: the heartbeat can't bring them back
    IF OLD.auto_offline_at IS NOT NULL AND NEW.rider_status = 'available' THEN
      NEW.rider_status := 'offline';
    END IF;
  END IF;

  IF NEW.rider_status = 'available' AND OLD.rider_status IS DISTINCT FROM 'available' THEN
    NEW.online_since := now();
    NEW.auto_offline_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_rider_online ON public.rider_profiles;
CREATE TRIGGER track_rider_online
  BEFORE INSERT OR UPDATE ON public.rider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.track_rider_online();

-- Called when the rider app opens (or comes back to the foreground)
CREATE OR REPLACE FUNCTION public.rider_app_opened()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_idle BOOLEAN;
BEGIN
  SELECT auto_offline_at IS NOT NULL INTO v_was_idle FROM public.rider_profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_was_idle, false) THEN
    RETURN false;
  END IF;
  PERFORM set_config('cydex.rider_resume', 'on', true);
  UPDATE public.rider_profiles SET auto_offline_at = NULL WHERE id = auth.uid();
  PERFORM set_config('cydex.rider_resume', 'off', true);
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rider_app_opened() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_app_opened() TO authenticated;

-- Runs every minute (pg_cron): stale location -> offline (as before), and
-- online but idle for rider_idle_minutes -> offline until the app is reopened
CREATE OR REPLACE FUNCTION public.mark_stale_riders_offline()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_idle INTEGER;
  v_minutes INTEGER;
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

  SELECT NULLIF(value, '')::integer INTO v_minutes FROM public.app_config WHERE key = 'rider_idle_minutes';
  IF COALESCE(v_minutes, 0) > 0 THEN
    UPDATE public.rider_profiles rp
    SET rider_status = 'offline', auto_offline_at = now()
    WHERE rp.rider_status = 'available'
      AND rp.online_since < now() - make_interval(mins => v_minutes)
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.rider_id = rp.id
          AND (o.status IN ('rider_assigned', 'picking_up', 'out_for_delivery', 'arrived')
               OR o.rider_assigned_at > now() - make_interval(mins => v_minutes))
      );
    GET DIAGNOSTICS v_idle = ROW_COUNT;
    v_count := v_count + v_idle;
  END IF;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_rider_idle_minutes(p_minutes INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old TEXT;
BEGIN
  PERFORM public.require_admin();
  IF p_minutes IS NULL OR p_minutes < 0 OR p_minutes > 1440 THEN
    RAISE EXCEPTION 'Enter a time between 0 (off) and 1440 minutes';
  END IF;
  SELECT value INTO v_old FROM public.app_config WHERE key = 'rider_idle_minutes';
  INSERT INTO public.app_config (key, value) VALUES ('rider_idle_minutes', p_minutes::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  PERFORM public.log_admin_action('set_rider_idle_minutes', 'setting', 'rider_idle_minutes',
    jsonb_build_object('minutes', v_old), jsonb_build_object('minutes', p_minutes));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_rider_idle_minutes(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_rider_idle_minutes(INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.rider_idle_minutes()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT NULLIF(value, '')::integer FROM public.app_config WHERE key = 'rider_idle_minutes'), 0);
$$;

REVOKE EXECUTE ON FUNCTION public.rider_idle_minutes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_idle_minutes() TO authenticated;
