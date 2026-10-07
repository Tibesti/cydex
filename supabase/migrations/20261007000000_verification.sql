-- ===================================================================
-- Vendor and rider verification
--
-- New (and existing) vendors and riders go through onboarding before using
-- the app. Their answers and status live in public.verifications:
--   (no row)    not onboarded yet -> onboarding page
--   pending     submitted, waiting for an admin (vendors with a licence;
--               all riders). Blocked, except a vendor who was already
--               trading as unverified and then applied (access_while_pending)
--   verified    approved by an admin; vendors get the badge
--   unverified  vendors who didn't upload a licence: can trade, no badge
--   rejected    admin gave a reason; they can edit and resubmit
--   suspended   admin gave a reason; blocked until reinstated
-- Only vendors who can trade are listed to customers or can take orders, and
-- only verified riders see or accept orders. See docs/VERIFICATION.md.
-- ===================================================================

-- ===================================================================
-- 1. Business categories (managed by admins)
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.business_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can see business categories" ON public.business_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage business categories" ON public.business_categories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_categories TO authenticated;

INSERT INTO public.business_categories (name) VALUES ('Restaurant') ON CONFLICT (name) DO NOTHING;

-- ===================================================================
-- 2. Verifications
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.verifications (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('vendor', 'rider')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'unverified', 'rejected', 'suspended')),
  -- A vendor who was trading as unverified keeps access while their licence is reviewed
  access_while_pending BOOLEAN NOT NULL DEFAULT false,
  status_before_suspension TEXT,
  -- Vendors
  business_category_id UUID REFERENCES public.business_categories(id),
  is_registered_business BOOLEAN,
  business_license_path TEXT,
  -- Riders
  vehicle_type TEXT CHECK (vehicle_type IN ('walking', 'bicycle', 'electric_bike', 'motorcycle', 'car')),
  vehicle_model TEXT,
  vehicle_year INTEGER,
  vehicle_color TEXT,
  vehicle_registration TEXT,
  id_document_type TEXT CHECK (id_document_type IN ('national_id', 'passport', 'voters_card', 'drivers_license')),
  id_document_path TEXT,
  -- Review
  rejection_reason TEXT,
  suspension_reason TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verifications_status ON public.verifications (status, role);
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their own verification" ON public.verifications
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Admins see all verifications" ON public.verifications
  FOR SELECT USING (public.is_admin());
GRANT SELECT ON public.verifications TO authenticated;

-- Can this vendor be listed to customers and take orders?
CREATE OR REPLACE FUNCTION public.vendor_can_trade(p_vendor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.verifications v
    WHERE v.profile_id = p_vendor_id AND v.role = 'vendor'
      AND (v.status IN ('verified', 'unverified') OR (v.status = 'pending' AND v.access_while_pending))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_verified_rider(p_rider_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.verifications v
    WHERE v.profile_id = p_rider_id AND v.role = 'rider' AND v.status = 'verified'
  );
$$;

-- Keeps the older verified flags in line (vendor badge, rider profile)
CREATE OR REPLACE FUNCTION public.sync_verification_flags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET verified = (NEW.status = 'verified') WHERE id = NEW.profile_id;
  IF NEW.role = 'rider' THEN
    UPDATE public.rider_profiles
    SET is_verified = (NEW.status = 'verified'), verification_status = NEW.status,
        vehicle_type = COALESCE(NEW.vehicle_type, vehicle_type),
        vehicle_registration = COALESCE(NEW.vehicle_registration, vehicle_registration),
        updated_at = now()
    WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_verification_flags
  AFTER INSERT OR UPDATE ON public.verifications
  FOR EACH ROW EXECUTE FUNCTION public.sync_verification_flags();

-- ===================================================================
-- 3. Documents (business licences, rider IDs): private bucket,
--    each user's own folder; admins can read all
-- ===================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('verification-docs', 'verification-docs', false, 5242880,
        ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users upload their verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Users read their verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins read verification documents" ON storage.objects;

CREATE POLICY "Users upload their verification documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read their verification documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Admins read verification documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs' AND public.is_admin());

-- ===================================================================
-- 4. Onboarding
-- ===================================================================

CREATE OR REPLACE FUNCTION public.notify_admins(p_type TEXT, p_title TEXT, p_message TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, type, title, message, metadata)
  SELECT id, p_type, p_title, p_message, '{}'::jsonb FROM public.profiles WHERE lower(role) = 'admin';
$$;

REVOKE EXECUTE ON FUNCTION public.notify_admins(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Vendor: store name, phone, category, registered business (+ licence).
-- Logo and banner are uploaded first (store-images) and must be set.
-- Returns the new status: pending (licence to review) or unverified.
CREATE OR REPLACE FUNCTION public.submit_vendor_onboarding(
  p_store_name TEXT,
  p_phone TEXT,
  p_category_id UUID,
  p_is_registered BOOLEAN,
  p_license_path TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_prev public.verifications%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_status TEXT;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'vendor' THEN
    RAISE EXCEPTION 'Only vendors can submit vendor onboarding';
  END IF;
  SELECT * INTO v_prev FROM public.verifications WHERE profile_id = v_uid FOR UPDATE;
  IF v_prev.status = 'suspended' THEN
    RAISE EXCEPTION 'Your account is suspended';
  END IF;
  IF v_prev.status = 'verified' THEN
    RAISE EXCEPTION 'Your store is already verified';
  END IF;

  IF NULLIF(trim(p_store_name), '') IS NULL THEN
    RAISE EXCEPTION 'Enter your store name';
  END IF;
  IF NOT public.is_valid_phone(p_phone) THEN
    RAISE EXCEPTION 'Enter a valid phone number';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_categories WHERE id = p_category_id AND is_active) THEN
    RAISE EXCEPTION 'Choose a business category';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NULLIF(v_profile.avatar, '') IS NULL OR NULLIF(v_profile.store_banner_url, '') IS NULL THEN
    RAISE EXCEPTION 'Upload your store logo and banner';
  END IF;
  IF p_is_registered AND NULLIF(p_license_path, '') IS NULL THEN
    RAISE EXCEPTION 'Upload your business licence';
  END IF;
  IF p_is_registered AND split_part(p_license_path, '/', 1) <> v_uid::text THEN
    RAISE EXCEPTION 'Upload your business licence again';
  END IF;

  UPDATE public.profiles SET name = trim(p_store_name), phone = trim(p_phone) WHERE id = v_uid;

  v_status := CASE WHEN p_is_registered THEN 'pending' ELSE 'unverified' END;

  INSERT INTO public.verifications (
    profile_id, role, status, access_while_pending, business_category_id, is_registered_business,
    business_license_path, rejection_reason, submitted_at, updated_at
  ) VALUES (
    v_uid, 'vendor', v_status, false, p_category_id, p_is_registered,
    CASE WHEN p_is_registered THEN p_license_path END, NULL, now(), now()
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    status = EXCLUDED.status,
    -- already trading as unverified: keep trading while the licence is reviewed
    access_while_pending = (EXCLUDED.status = 'pending' AND verifications.status = 'unverified')
                           OR (EXCLUDED.status = 'pending' AND verifications.access_while_pending),
    business_category_id = EXCLUDED.business_category_id,
    is_registered_business = EXCLUDED.is_registered_business,
    business_license_path = EXCLUDED.business_license_path,
    rejection_reason = NULL,
    submitted_at = now(),
    updated_at = now();

  IF v_status = 'pending' THEN
    PERFORM public.notify_admins('verification_request', 'Vendor to verify',
      trim(p_store_name) || ' submitted their business licence for verification.');
  END IF;
  RETURN v_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_vendor_onboarding(TEXT, TEXT, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_onboarding(TEXT, TEXT, UUID, BOOLEAN, TEXT) TO authenticated;

-- Rider: phone, address (saved first with the address picker), vehicle, ID.
-- Always pending until an admin verifies.
CREATE OR REPLACE FUNCTION public.submit_rider_onboarding(
  p_phone TEXT,
  p_vehicle_type TEXT,
  p_vehicle_model TEXT,
  p_vehicle_year INTEGER,
  p_vehicle_color TEXT,
  p_vehicle_registration TEXT,
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
  v_motor BOOLEAN := p_vehicle_type IN ('electric_bike', 'motorcycle', 'car');
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'rider' THEN
    RAISE EXCEPTION 'Only riders can submit rider onboarding';
  END IF;
  SELECT * INTO v_prev FROM public.verifications WHERE profile_id = v_uid FOR UPDATE;
  IF v_prev.status = 'suspended' THEN
    RAISE EXCEPTION 'Your account is suspended';
  END IF;
  IF v_prev.status = 'verified' THEN
    RAISE EXCEPTION 'Your account is already verified';
  END IF;

  IF NOT public.is_valid_phone(p_phone) THEN
    RAISE EXCEPTION 'Enter a valid phone number';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.addresses WHERE profile_id = v_uid) THEN
    RAISE EXCEPTION 'Add your address';
  END IF;
  IF p_vehicle_type IS NULL OR p_vehicle_type NOT IN ('walking', 'bicycle', 'electric_bike', 'motorcycle', 'car') THEN
    RAISE EXCEPTION 'Choose how you deliver';
  END IF;
  IF v_motor AND (NULLIF(trim(p_vehicle_model), '') IS NULL OR p_vehicle_year IS NULL OR NULLIF(trim(p_vehicle_color), '') IS NULL) THEN
    RAISE EXCEPTION 'Enter your vehicle''s model, year and colour';
  END IF;
  IF p_vehicle_year IS NOT NULL AND (p_vehicle_year < 1980 OR p_vehicle_year > extract(year FROM now())::int + 1) THEN
    RAISE EXCEPTION 'Enter a valid vehicle year';
  END IF;
  IF p_id_document_type IS NULL OR p_id_document_type NOT IN ('national_id', 'passport', 'voters_card', 'drivers_license') THEN
    RAISE EXCEPTION 'Choose your ID type';
  END IF;
  IF NULLIF(p_id_document_path, '') IS NULL OR split_part(p_id_document_path, '/', 1) <> v_uid::text THEN
    RAISE EXCEPTION 'Upload your ID document';
  END IF;

  UPDATE public.profiles SET phone = trim(p_phone) WHERE id = v_uid;
  INSERT INTO public.rider_profiles (id) VALUES (v_uid) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.verifications (
    profile_id, role, status, vehicle_type, vehicle_model, vehicle_year, vehicle_color,
    vehicle_registration, id_document_type, id_document_path, rejection_reason, submitted_at, updated_at
  ) VALUES (
    v_uid, 'rider', 'pending', p_vehicle_type, NULLIF(trim(p_vehicle_model), ''), p_vehicle_year,
    NULLIF(trim(p_vehicle_color), ''), NULLIF(trim(p_vehicle_registration), ''), p_id_document_type,
    p_id_document_path, NULL, now(), now()
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    status = 'pending',
    vehicle_type = EXCLUDED.vehicle_type,
    vehicle_model = EXCLUDED.vehicle_model,
    vehicle_year = EXCLUDED.vehicle_year,
    vehicle_color = EXCLUDED.vehicle_color,
    vehicle_registration = EXCLUDED.vehicle_registration,
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

REVOKE EXECUTE ON FUNCTION public.submit_rider_onboarding(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_rider_onboarding(TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ===================================================================
-- 5. Admin review: verify | reject | suspend | reinstate
--    Reject and suspend need a reason; the user is notified and emailed.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.admin_review_verification(p_profile_id UUID, p_action TEXT, p_reason TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.verifications%ROWTYPE;
  v_reason TEXT := NULLIF(trim(p_reason), '');
  v_status TEXT;
  v_who TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can review verifications';
  END IF;
  SELECT * INTO v FROM public.verifications WHERE profile_id = p_profile_id FOR UPDATE;
  IF v.profile_id IS NULL THEN
    RAISE EXCEPTION 'This account hasn''t completed onboarding';
  END IF;
  v_who := CASE v.role WHEN 'vendor' THEN 'store' ELSE 'rider account' END;

  IF p_action = 'verify' THEN
    IF v.status NOT IN ('pending', 'unverified', 'rejected') THEN
      RAISE EXCEPTION 'Only pending, unverified or rejected accounts can be verified';
    END IF;
    v_status := 'verified';
    UPDATE public.verifications
    SET status = 'verified', access_while_pending = false, rejection_reason = NULL,
        reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
    WHERE profile_id = p_profile_id;
    PERFORM public.notify_user(p_profile_id, 'verification_approved', 'You''re verified',
      'Your ' || v_who || ' has been verified.' || CASE WHEN v.role = 'vendor' THEN ' Customers now see your verified badge.' ELSE ' You can now accept deliveries.' END);
    PERFORM public.queue_email(p_profile_id, 'verification_approved', 'Your Cydex ' || v_who || ' is verified',
      jsonb_build_object('role', v.role));

  ELSIF p_action = 'reject' THEN
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'Give a reason for rejecting';
    END IF;
    IF v.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending verifications can be rejected';
    END IF;
    -- A vendor who was trading as unverified goes back to unverified
    v_status := CASE WHEN v.access_while_pending THEN 'unverified' ELSE 'rejected' END;
    UPDATE public.verifications
    SET status = v_status, access_while_pending = false, rejection_reason = v_reason,
        reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
    WHERE profile_id = p_profile_id;
    PERFORM public.notify_user(p_profile_id, 'verification_rejected', 'Verification not approved',
      'Your verification wasn''t approved: ' || v_reason || ' You can update your details and resubmit.');
    PERFORM public.queue_email(p_profile_id, 'verification_rejected', 'Your Cydex verification wasn''t approved',
      jsonb_build_object('role', v.role, 'reason', v_reason));

  ELSIF p_action = 'suspend' THEN
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'Give a reason for suspending';
    END IF;
    IF v.status = 'suspended' THEN
      RAISE EXCEPTION 'This account is already suspended';
    END IF;
    v_status := 'suspended';
    UPDATE public.verifications
    SET status = 'suspended', status_before_suspension = v.status, suspension_reason = v_reason,
        reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
    WHERE profile_id = p_profile_id;
    IF v.role = 'rider' THEN
      UPDATE public.rider_profiles SET rider_status = 'offline' WHERE id = p_profile_id;
    END IF;
    PERFORM public.notify_user(p_profile_id, 'account_suspended', 'Account suspended',
      'Your account has been suspended: ' || v_reason);
    PERFORM public.queue_email(p_profile_id, 'account_suspended', 'Your Cydex account has been suspended',
      jsonb_build_object('role', v.role, 'reason', v_reason));

  ELSIF p_action = 'reinstate' THEN
    IF v.status <> 'suspended' THEN
      RAISE EXCEPTION 'Only suspended accounts can be reinstated';
    END IF;
    v_status := COALESCE(v.status_before_suspension, 'pending');
    UPDATE public.verifications
    SET status = v_status, status_before_suspension = NULL, suspension_reason = NULL,
        reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
    WHERE profile_id = p_profile_id;
    PERFORM public.notify_user(p_profile_id, 'account_reinstated', 'Account reinstated',
      'Your account is active again.');

  ELSE
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  RETURN v_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_review_verification(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(UUID, TEXT, TEXT) TO authenticated;

-- ===================================================================
-- 6. Enforcement: who can trade, deliver and be listed
-- ===================================================================

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
    WHERE public.vendor_can_trade(a.profile_id)
    ORDER BY a.profile_id, a.is_default DESC, a.created_at DESC
  )
  SELECT s.profile_id,
         round((public.distance_m(s.latitude, s.longitude, d.latitude, d.longitude) / 1000)::numeric, 2)
  FROM stores s CROSS JOIN dest d
  WHERE public.distance_m(s.latitude, s.longitude, d.latitude, d.longitude) <= public.customer_vendor_radius_m()
  ORDER BY 2;
$$;


CREATE OR REPLACE FUNCTION public.cart_subtotal(p_vendor_id UUID, p_items JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC := 0;
  v_item JSONB;
  v_product public.products%ROWTYPE;
  v_quantity INTEGER;
BEGIN
  IF NOT public.vendor_can_trade(p_vendor_id) THEN
    RAISE EXCEPTION 'This vendor isn''t taking orders right now';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := (v_item ->> 'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'Each item needs a quantity of at least 1';
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = (v_item ->> 'product_id')::uuid;
    IF v_product.id IS NULL OR v_product.vendor_id IS DISTINCT FROM p_vendor_id THEN
      RAISE EXCEPTION 'An item in your cart is no longer sold by this vendor';
    END IF;
    IF v_product.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION '% is not available right now', v_product.name;
    END IF;
    IF v_product.track_stock AND v_quantity > v_product.stock_quantity THEN
      RAISE EXCEPTION 'Only % of % left. Reduce the quantity in your cart.', v_product.stock_quantity, v_product.name;
    END IF;

    v_total := v_total + v_product.price * v_quantity;
  END LOOP;

  RETURN v_total;
END;
$$;


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
  IF NOT public.vendor_can_trade(o.vendor_id) THEN
    RAISE EXCEPTION 'Your store isn''t active yet. Finish onboarding or wait for verification.';
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


CREATE OR REPLACE FUNCTION public.rider_accept_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
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
  IF NOT public.order_pickup_within_rider_radius(o.id) THEN
    RAISE EXCEPTION 'This order is outside your delivery range';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE rider_id = auth.uid()
             AND status IN ('rider_assigned', 'picking_up', 'out_for_delivery')) THEN
    RAISE EXCEPTION 'Finish your current delivery before accepting another';
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);
  UPDATE public.orders SET rider_id = auth.uid(), status = 'rider_assigned', rider_assigned_at = now()
  WHERE id = o.id;
  UPDATE public.deliveries SET rider_id = auth.uid(), status = 'accepted', accepted_at = now()
  WHERE order_id = o.id;
END;
$$;


CREATE OR REPLACE FUNCTION public.create_rider_request(
  p_recipient_name TEXT,
  p_recipient_phone TEXT,
  p_location JSONB,
  p_package_details TEXT DEFAULT NULL,
  p_save_customer BOOLEAN DEFAULT false
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
  IF NULLIF(trim(p_recipient_name), '') IS NULL THEN
    RAISE EXCEPTION 'Enter the name of the person receiving the delivery';
  END IF;
  IF NOT public.is_valid_phone(p_recipient_phone) THEN
    RAISE EXCEPTION 'Enter a valid phone number for the person receiving the delivery';
  END IF;
  IF v_lat IS NULL OR v_lng IS NULL OR NULLIF(p_location ->> 'formatted_address', '') IS NULL THEN
    RAISE EXCEPTION 'Choose the delivery location on the map';
  END IF;

  SELECT * INTO q FROM public.rider_request_quote(v_lat, v_lng);
  IF q.status = 'no_store' THEN
    RAISE EXCEPTION 'Set your store location in Settings before requesting a rider';
  ELSIF q.status = 'out_of_range' THEN
    RAISE EXCEPTION 'The delivery location is more than 5 km from your store';
  END IF;

  -- Wallet first
  SELECT available_balance INTO v_wallet FROM public.vendor_wallet WHERE vendor_id = v_vendor FOR UPDATE;
  v_wallet := LEAST(COALESCE(v_wallet, 0), q.total_amount);

  INSERT INTO public.orders (
    order_type, customer_id, vendor_id, status, payment_status, delivery_type,
    delivery_address, subtotal, delivery_fee, service_charge, total_amount,
    distance_km, base_rate, distance_fee, wallet_amount, special_instructions
  ) VALUES (
    'rider_request', NULL, v_vendor, 'pending', 'pending', 'standard',
    jsonb_build_object(
      'name', trim(p_recipient_name),
      'phone', trim(p_recipient_phone),
      'address', p_location ->> 'formatted_address',
      'formatted_address', p_location ->> 'formatted_address',
      'street', COALESCE(NULLIF(p_location ->> 'place_name', ''), NULLIF(p_location ->> 'street', ''),
                         split_part(p_location ->> 'formatted_address', ',', 1)),
      'city', COALESCE(p_location ->> 'city', ''),
      'state', COALESCE(p_location ->> 'state', ''),
      'country', COALESCE(p_location ->> 'country', ''),
      'place_id', p_location ->> 'place_id',
      'additional_info', COALESCE(p_location ->> 'directions', ''),
      'latitude', v_lat,
      'longitude', v_lng
    ),
    0, q.delivery_fee, q.commission, q.total_amount,
    q.distance_km, q.base_rate, q.distance_fee, v_wallet, NULLIF(trim(p_package_details), '')
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
      vendor_id, name, phone, place_name, formatted_address, street, city, state, country,
      place_id, latitude, longitude, directions
    ) VALUES (
      v_vendor, trim(p_recipient_name), trim(p_recipient_phone), p_location ->> 'place_name',
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


CREATE OR REPLACE FUNCTION public.notify_order_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref TEXT := '#' || NEW.order_number;
  v_hold public.payment_holds%ROWTYPE;
  v_store public.addresses%ROWTYPE;
  v_rider RECORD;
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
      IF NEW.order_type = 'rider_request' THEN
        PERFORM public.notify_user(NEW.vendor_id, 'rider_request_live', 'Finding you a rider',
          'Rider request ' || v_ref || ' is live. Nearby riders have been notified.', NEW);
      END IF;
      PERFORM public.notify_user(NEW.customer_id, 'order_ready', 'Order ready',
        'Order ' || v_ref || ' is ready. We''re finding a rider to pick it up.', NEW);

      -- Online riders within their radius of the store
      SELECT * INTO v_store FROM public.addresses
      WHERE profile_id = NEW.vendor_id ORDER BY is_default DESC, created_at DESC LIMIT 1;
      IF v_store.id IS NOT NULL THEN
        FOR v_rider IN
          SELECT rp.id,
                 public.distance_m((rp.current_location ->> 'latitude')::float8, (rp.current_location ->> 'longitude')::float8,
                                   v_store.latitude, v_store.longitude) AS meters
          FROM public.rider_profiles rp
          WHERE rp.rider_status = 'available'
            AND public.is_verified_rider(rp.id)
            AND rp.current_location ? 'latitude'
            AND rp.current_location ? 'longitude'
            AND public.distance_m((rp.current_location ->> 'latitude')::float8, (rp.current_location ->> 'longitude')::float8,
                                  v_store.latitude, v_store.longitude) <= public.rider_order_radius_m()
        LOOP
          PERFORM public.notify_user(v_rider.id, 'order_nearby', 'Order nearby',
            'Order ' || v_ref || ' is ready for pickup ' || round((v_rider.meters / 1000)::numeric, 1) || ' km from you.', NEW);
        END LOOP;
      END IF;

    WHEN 'rider_assigned' THEN
      PERFORM public.notify_user(NEW.customer_id, 'rider_assigned', 'Rider assigned',
        'A rider has accepted order ' || v_ref || '.', NEW);
      IF NEW.order_type = 'rider_request' THEN
        PERFORM public.notify_user(NEW.vendor_id, 'rider_assigned', 'Rider on the way',
          'A rider accepted rider request ' || v_ref || ' and will come to collect it.', NEW);
      END IF;

    WHEN 'picking_up' THEN
      PERFORM public.notify_user(NEW.customer_id, 'rider_heading_to_vendor', 'Rider on the way to the vendor',
        'Your rider is heading to the vendor to collect order ' || v_ref || '.', NEW);

    WHEN 'out_for_delivery' THEN
      PERFORM public.notify_user(NEW.customer_id, 'out_for_delivery', 'Order on its way',
        'Your rider has picked up order ' || v_ref || '. Have your delivery code ready.', NEW);
      PERFORM public.notify_user(NEW.vendor_id, 'picked_up', 'Order picked up',
        'The rider has collected order ' || v_ref || '.', NEW);

    WHEN 'delivered' THEN
      SELECT * INTO v_hold FROM public.payment_holds WHERE order_id = NEW.id;
      PERFORM public.notify_user(NEW.customer_id, 'delivered', 'Order delivered',
        'Order ' || v_ref || ' has been delivered. Enjoy!', NEW);
      IF NEW.order_type = 'rider_request' THEN
        PERFORM public.notify_user(NEW.vendor_id, 'delivered', 'Delivery complete',
          'Your rider request ' || v_ref || ' was delivered to ' || COALESCE(NEW.delivery_address ->> 'name', 'the recipient') || '.', NEW);
      ELSE
        PERFORM public.notify_user(NEW.vendor_id, 'delivered', 'Order delivered',
          'Order ' || v_ref || ' was delivered. ₦' || to_char(COALESCE(v_hold.vendor_amount, 0), 'FM999,999,990.00')
          || ' has been added to your wallet.', NEW);
      END IF;
      PERFORM public.notify_user(NEW.rider_id, 'delivered', 'Delivery complete',
        'Order ' || v_ref || ' was delivered. ₦' || to_char(COALESCE(v_hold.rider_amount, 0), 'FM999,999,990.00')
        || ' has been added to your wallet.', NEW);

    WHEN 'cancelled' THEN
      PERFORM public.notify_user(NEW.customer_id, 'cancelled', 'Order cancelled',
        'You cancelled order ' || v_ref || '.', NEW);
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


-- Riders only see available orders and deliveries once verified
DROP POLICY IF EXISTS "Riders can view available orders for pickup" ON public.orders;
CREATE POLICY "Riders can view available orders for pickup" ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'rider'
    AND public.is_verified_rider(auth.uid())
    AND payment_status = 'paid'
    AND status = 'ready_for_pickup'
    AND rider_id IS NULL
    AND delivery_type != 'pickup'
    AND public.order_pickup_within_rider_radius(id)
  );

DROP POLICY IF EXISTS "Riders can view available deliveries" ON public.deliveries;
CREATE POLICY "Riders can view available deliveries" ON public.deliveries
  FOR SELECT TO authenticated
  USING (
    status = 'available'
    AND rider_id IS NULL
    AND public.current_user_role() = 'rider'
    AND public.is_verified_rider(auth.uid())
    AND public.within_rider_radius(
      (pickup_location ->> 'latitude')::double precision,
      (pickup_location ->> 'longitude')::double precision
    )
  );
