-- ===================================================================
-- Verification emails
--   Vendors and riders were already emailed when verified, not approved or
--   suspended. They're now also emailed when their details are received
--   (and going to review) and when a suspension is lifted.
--   Same functions as before with the queue_email calls added.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.submit_rider_onboarding(p_phone text, p_vehicle_type text, p_vehicle_color text, p_vehicle_photo_path text, p_vehicle_registration text, p_registration_doc_path text, p_id_document_type text, p_id_document_path text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM public.queue_email(v_uid, 'verification_submitted', 'We''ve received your Cydex rider details',
    jsonb_build_object('role', 'rider'));
  PERFORM public.notify_admins('verification_request', 'Rider to verify',
    COALESCE((SELECT name FROM public.profiles WHERE id = v_uid), 'A rider') || ' submitted their details for verification.');
  RETURN 'pending';
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_vendor_onboarding(p_store_name text, p_phone text, p_category_id uuid, p_is_registered boolean, p_license_path text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    PERFORM public.queue_email(v_uid, 'verification_submitted', 'We''ve received your Cydex store details',
      jsonb_build_object('role', 'vendor'));
    PERFORM public.notify_admins('verification_request', 'Vendor to verify',
      trim(p_store_name) || ' submitted their business licence for verification.');
  END IF;
  RETURN v_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_verification(p_profile_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    PERFORM public.queue_email(p_profile_id, 'account_reinstated', 'Your Cydex account is active again',
      jsonb_build_object('role', v.role));
    PERFORM public.notify_user(p_profile_id, 'account_reinstated', 'Account reinstated',
      'Your account is active again.');

  ELSE
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  PERFORM public.log_admin_action('verification_' || p_action, v.role, p_profile_id::text, jsonb_build_object('status', v.status), jsonb_build_object('status', v_status, 'reason', v_reason));
  RETURN v_status;
END;
$function$;
