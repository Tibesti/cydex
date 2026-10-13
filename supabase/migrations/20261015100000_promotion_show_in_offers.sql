-- A switch on each promotion: whether it's listed under "Offers for you"
-- (home pages and the codes offered at checkout). On by default.
--   * A hidden coupon still works for anyone who's given the code: use it for
--     codes meant for particular people (a partner, a one-off campaign).
--   * A hidden automatic promotion still applies by itself at checkout.

ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS show_in_offers BOOLEAN NOT NULL DEFAULT true;

DROP FUNCTION IF EXISTS public.admin_save_promotion(TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID, TEXT, NUMERIC, TEXT[], INTEGER, INTEGER, BOOLEAN);
CREATE OR REPLACE FUNCTION public.admin_save_promotion(p_name text, p_discount_type text, p_discount_value numeric, p_applies_to text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_audience text DEFAULT 'customer'::text, p_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_vendor_id uuid DEFAULT NULL::uuid, p_cost_bearer text DEFAULT 'cydex'::text, p_max_distance_km numeric DEFAULT NULL::numeric, p_vehicle_types text[] DEFAULT NULL::text[], p_max_users integer DEFAULT NULL::integer, p_max_uses_per_user integer DEFAULT NULL::integer, p_is_active boolean DEFAULT true, p_show_in_offers boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name TEXT := NULLIF(trim(p_name), '');
  v_code TEXT := NULLIF(upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g')), '');
  v_vehicles TEXT[] := CASE WHEN COALESCE(array_length(p_vehicle_types, 1), 0) = 0 THEN NULL ELSE p_vehicle_types END;
  v_bearer TEXT := CASE WHEN p_applies_to = 'items' THEN COALESCE(p_cost_bearer, 'cydex') ELSE 'cydex' END;
  v_vendor UUID := CASE WHEN p_applies_to = 'items' THEN p_vendor_id END;
  v_audience TEXT := COALESCE(p_audience, 'customer');
  v_old JSONB;
  v_id UUID := p_id;
BEGIN
  PERFORM public.require_admin();
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Give the promotion a name';
  END IF;
  IF v_audience NOT IN ('customer', 'vendor', 'rider', 'all') THEN
    RAISE EXCEPTION 'Choose who the promotion is for';
  END IF;
  IF p_discount_type NOT IN ('percent', 'flat') OR p_discount_value IS NULL OR p_discount_value <= 0 THEN
    RAISE EXCEPTION 'Enter the discount';
  END IF;
  IF p_discount_type = 'percent' AND p_discount_value > 100 THEN
    RAISE EXCEPTION 'A percentage discount can''t be more than 100%%';
  END IF;
  IF p_applies_to IS NULL OR NOT (
       (v_audience = 'customer' AND p_applies_to IN ('service_charge', 'delivery_fee', 'items'))
    OR (v_audience = 'vendor' AND p_applies_to IN ('service_charge', 'delivery_fee', 'commission'))
    OR (v_audience = 'rider' AND p_applies_to = 'commission')
    OR (v_audience = 'all' AND p_applies_to IN ('service_charge', 'delivery_fee', 'commission'))) THEN
    RAISE EXCEPTION 'Choose what the discount applies to';
  END IF;
  IF p_applies_to = 'items' AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_vendor AND lower(role) = 'vendor') THEN
    RAISE EXCEPTION 'Choose the business the items discount is for';
  END IF;
  IF v_bearer NOT IN ('cydex', 'vendor') THEN
    RAISE EXCEPTION 'Choose who pays for the discount';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'The end date must be after the start date';
  END IF;
  IF p_max_distance_km IS NOT NULL AND p_max_distance_km <= 0 THEN
    RAISE EXCEPTION 'The distance must be more than 0 km';
  END IF;
  IF v_vehicles IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_vehicles) k WHERE k NOT IN (SELECT key FROM public.vehicle_types)) THEN
    RAISE EXCEPTION 'Unknown delivery mode';
  END IF;
  IF p_max_users IS NOT NULL AND p_max_users <= 0 THEN
    RAISE EXCEPTION 'The number of people must be at least 1';
  END IF;
  IF p_max_uses_per_user IS NOT NULL AND p_max_uses_per_user <= 0 THEN
    RAISE EXCEPTION 'The number of uses for each person must be at least 1';
  END IF;
  IF v_code IS NOT NULL AND p_applies_to = 'commission' THEN
    RAISE EXCEPTION 'A commission promotion applies by itself, so it can''t have a coupon code';
  END IF;
  IF v_code IS NOT NULL AND v_code !~ '^[A-Z0-9_-]{3,20}$' THEN
    RAISE EXCEPTION 'A coupon code is 3 to 20 letters or numbers';
  END IF;
  IF v_code IS NOT NULL AND EXISTS (SELECT 1 FROM public.promotions WHERE code = v_code AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'That coupon code is already used by another promotion';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions (name, code, discount_type, discount_value, applies_to, vendor_id, cost_bearer,
                                   max_distance_km, vehicle_types, starts_at, ends_at, is_active, created_by,
                                   audience, max_users, max_uses_per_user, show_in_offers)
    VALUES (v_name, v_code, p_discount_type, p_discount_value, p_applies_to, v_vendor, v_bearer,
            p_max_distance_km, v_vehicles, p_starts_at, p_ends_at, COALESCE(p_is_active, true), auth.uid(),
            v_audience, p_max_users, p_max_uses_per_user, COALESCE(p_show_in_offers, true))
    RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(p) INTO v_old FROM public.promotions p WHERE id = p_id;
    IF v_old IS NULL THEN
      RAISE EXCEPTION 'Promotion not found';
    END IF;
    UPDATE public.promotions
    SET name = v_name, code = v_code, discount_type = p_discount_type, discount_value = p_discount_value,
        applies_to = p_applies_to, vendor_id = v_vendor, cost_bearer = v_bearer, max_distance_km = p_max_distance_km,
        vehicle_types = v_vehicles, starts_at = p_starts_at, ends_at = p_ends_at, is_active = COALESCE(p_is_active, true),
        audience = v_audience, max_users = p_max_users, max_uses_per_user = p_max_uses_per_user,
        show_in_offers = COALESCE(p_show_in_offers, true)
    WHERE id = p_id;
  END IF;

  PERFORM public.log_admin_action(CASE WHEN p_id IS NULL THEN 'create_promotion' ELSE 'update_promotion' END,
    'promotion', v_id::text, v_old, (SELECT to_jsonb(p) FROM public.promotions p WHERE id = v_id));
  RETURN v_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_save_promotion(TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID, TEXT, NUMERIC, TEXT[], INTEGER, INTEGER, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_promotion(TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID, TEXT, NUMERIC, TEXT[], INTEGER, INTEGER, BOOLEAN, BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_promotions();
CREATE OR REPLACE FUNCTION public.admin_promotions()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, discount_value numeric, applies_to text, vendor_id uuid, vendor_name text, cost_bearer text, max_distance_km numeric, vehicle_types text[], starts_at timestamp with time zone, ends_at timestamp with time zone, is_active boolean, created_at timestamp with time zone, state text, uses bigint, total_discount numeric, audience text, max_users integer, max_uses_per_user integer, users bigint, show_in_offers boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT p.id, p.name, p.code, p.discount_type, p.discount_value, p.applies_to, p.vendor_id, v.name, p.cost_bearer,
         p.max_distance_km, p.vehicle_types, p.starts_at, p.ends_at, p.is_active, p.created_at,
         CASE WHEN NOT p.is_active THEN 'off' WHEN now() < p.starts_at THEN 'scheduled'
              WHEN now() >= p.ends_at THEN 'ended'
              WHEN p.max_users IS NOT NULL AND u.users >= p.max_users AND p.max_uses_per_user IS NOT NULL
                   AND u.uses >= p.max_users::bigint * p.max_uses_per_user THEN 'claimed'
              ELSE 'running' END,
         u.uses,
         (SELECT COALESCE(sum(CASE WHEN o.promotion_id = p.id THEN o.discount_amount ELSE 0 END
                              + CASE WHEN o.vendor_promotion_id = p.id THEN o.vendor_commission_discount ELSE 0 END
                              + CASE WHEN o.rider_promotion_id = p.id THEN o.rider_commission_discount ELSE 0 END), 0)
          FROM public.orders o
          WHERE p.id IN (o.promotion_id, o.vendor_promotion_id, o.rider_promotion_id) AND o.payment_status = 'paid'
            AND o.status NOT IN ('cancelled', 'rejected')),
         p.audience, p.max_users, p.max_uses_per_user, u.users, p.show_in_offers
  FROM public.promotions p
  LEFT JOIN public.profiles v ON v.id = p.vendor_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(sum(x.uses), 0)::bigint AS uses, count(*)::bigint AS users FROM public.promotion_uses(p.id) x
  ) u
  ORDER BY p.created_at DESC;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_promotions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_promotions() TO authenticated;

-- Only the promotions marked to be shown
CREATE OR REPLACE FUNCTION public.my_promotions()
 RETURNS TABLE(id uuid, name text, code text, discount_type text, discount_value numeric, applies_to text, vendor_id uuid, vendor_name text, max_distance_km numeric, vehicle_types text[], ends_at timestamp with time zone, uses_left integer, places_left integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.name, p.code, p.discount_type, p.discount_value, p.applies_to, p.vendor_id, v.name,
         p.max_distance_km, p.vehicle_types, p.ends_at, room.uses_left,
         CASE WHEN p.max_users IS NULL THEN NULL
              ELSE GREATEST(p.max_users - (SELECT count(*) FROM public.promotion_uses(p.id)), 0)::int END
  FROM public.promotions p
  JOIN public.profiles me ON me.id = auth.uid()
  LEFT JOIN public.profiles v ON v.id = p.vendor_id
  CROSS JOIN LATERAL public.promotion_room(p.id, me.id) room
  WHERE p.is_active
    AND p.show_in_offers
    AND now() >= p.starts_at AND now() < p.ends_at
    AND lower(me.role) IN ('customer', 'vendor', 'rider')
    AND p.audience IN (lower(me.role), 'all')
    AND CASE lower(me.role)
          WHEN 'customer' THEN p.applies_to IN ('service_charge', 'delivery_fee', 'items')
          WHEN 'vendor' THEN p.applies_to IN ('service_charge', 'delivery_fee', 'commission')
          ELSE p.applies_to = 'commission' END
    AND room.eligible
  -- The ones that need nothing from them first, then the soonest to end
  ORDER BY (p.code IS NOT NULL), p.ends_at;
$function$;
