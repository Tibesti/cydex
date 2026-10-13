-- "Offers for you" now lists coupon-code promotions too, with the code to
-- enter, as well as the ones that apply by themselves. Still only the ones the
-- signed-in person can use: right audience, running now, and with room left
-- for them under any limit.

DROP FUNCTION IF EXISTS public.my_promotions();
CREATE OR REPLACE FUNCTION public.my_promotions()
RETURNS TABLE (
  id UUID, name TEXT, code TEXT, discount_type TEXT, discount_value NUMERIC, applies_to TEXT, vendor_id UUID,
  vendor_name TEXT, max_distance_km NUMERIC, vehicle_types TEXT[], ends_at TIMESTAMPTZ, uses_left INTEGER,
  places_left INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.code, p.discount_type, p.discount_value, p.applies_to, p.vendor_id, v.name,
         p.max_distance_km, p.vehicle_types, p.ends_at, room.uses_left,
         CASE WHEN p.max_users IS NULL THEN NULL
              ELSE GREATEST(p.max_users - (SELECT count(*) FROM public.promotion_uses(p.id)), 0)::int END
  FROM public.promotions p
  JOIN public.profiles me ON me.id = auth.uid()
  LEFT JOIN public.profiles v ON v.id = p.vendor_id
  CROSS JOIN LATERAL public.promotion_room(p.id, me.id) room
  WHERE p.is_active
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
$$;
REVOKE EXECUTE ON FUNCTION public.my_promotions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_promotions() TO authenticated;
