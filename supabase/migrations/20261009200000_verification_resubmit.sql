-- ===================================================================
-- Verified vendors and riders can update their verification details
--   (documents, category, vehicle). Resubmitting sends the account back to
--   'pending': a rider can't take deliveries, and a vendor can't trade,
--   until an admin approves it again. The app warns them first.
--   Same functions as 20261007000000_verification.sql, without the
--   "already verified" block.
-- ===================================================================

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

-- A verified user resubmitting changes their own profiles.verified flag (to
-- false) through this sync. Mark it as a system change so
-- protect_profile_fields lets it through; users still can't change it directly.
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
        vehicle_registration = COALESCE(NEW.vehicle_registration, vehicle_registration),
        updated_at = now()
    WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Users may edit their own profile but not their role, status or verified
-- flag. Requests without a user (SQL editor, service role) and the
-- verification sync above are not limited.
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin()
     AND COALESCE(current_setting('cydex.profile_sync', true), 'off') <> 'on' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.verified IS DISTINCT FROM OLD.verified THEN
      RAISE EXCEPTION 'Only admins can change role, status or verification';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
