-- ===================================================================
-- Riders only see (and can accept) orders whose pickup is within 5 km
-- (straight line) of their live location. See
-- docs/PRICING_MODEL_IMPLEMENTATION_PLAN.md → "Rider radius".
--   - rider position: rider_profiles.current_location (sent by the rider app)
--   - pickup position: deliveries.pickup_location (the vendor's store,
--     copied when the vendor accepts the order)
-- Riders with no saved position, and pickups with no coordinates (vendor
-- without a store address), match nothing.
-- ===================================================================

-- Radius in metres; change here to widen or narrow it
CREATE OR REPLACE FUNCTION public.rider_order_radius_m()
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 5000::double precision;
$$;

-- Straight-line (great-circle) distance in metres
CREATE OR REPLACE FUNCTION public.distance_m(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- True when a point is within the radius of the current rider's live location
CREATE OR REPLACE FUNCTION public.within_rider_radius(p_latitude DOUBLE PRECISION, p_longitude DOUBLE PRECISION)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public.distance_m(
             (rp.current_location ->> 'latitude')::double precision,
             (rp.current_location ->> 'longitude')::double precision,
             p_latitude, p_longitude
           ) <= public.rider_order_radius_m()
    FROM public.rider_profiles rp
    WHERE rp.id = auth.uid()
      AND rp.current_location ? 'latitude'
      AND rp.current_location ? 'longitude'
      AND p_latitude IS NOT NULL
      AND p_longitude IS NOT NULL
  ), false);
$$;

-- Same check for an order, using its delivery's pickup point. SECURITY DEFINER
-- so the orders policies can read deliveries without recursing into their policies.
CREATE OR REPLACE FUNCTION public.order_pickup_within_rider_radius(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.order_id = p_order_id
      AND public.within_rider_radius(
            (d.pickup_location ->> 'latitude')::double precision,
            (d.pickup_location ->> 'longitude')::double precision
          )
  );
$$;

-- ===================================================================
-- Apply the radius to what riders can see and accept
-- (their own assigned orders/deliveries are unaffected)
-- ===================================================================

DROP POLICY IF EXISTS "Riders can view available orders for pickup" ON public.orders;
CREATE POLICY "Riders can view available orders for pickup" ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'rider'
    AND payment_status = 'paid'
    AND status IN ('accepted', 'processing', 'ready', 'ready_for_pickup')
    AND rider_id IS NULL
    AND delivery_type != 'pickup'
    AND public.order_pickup_within_rider_radius(id)
  );

DROP POLICY IF EXISTS "Riders can accept available orders" ON public.orders;
CREATE POLICY "Riders can accept available orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    rider_id IS NULL
    AND payment_status = 'paid'
    AND status IN ('accepted', 'processing', 'ready', 'ready_for_pickup')
    AND public.current_user_role() = 'rider'
    AND public.order_pickup_within_rider_radius(id)
  )
  WITH CHECK (rider_id = auth.uid());

DROP POLICY IF EXISTS "Riders can view available deliveries" ON public.deliveries;
CREATE POLICY "Riders can view available deliveries" ON public.deliveries
  FOR SELECT TO authenticated
  USING (
    status = 'available'
    AND rider_id IS NULL
    AND public.current_user_role() = 'rider'
    AND public.within_rider_radius(
          (pickup_location ->> 'latitude')::double precision,
          (pickup_location ->> 'longitude')::double precision
        )
  );

DROP POLICY IF EXISTS "Riders can accept available deliveries" ON public.deliveries;
CREATE POLICY "Riders can accept available deliveries" ON public.deliveries
  FOR UPDATE TO authenticated
  USING (
    status = 'available'
    AND rider_id IS NULL
    AND public.current_user_role() = 'rider'
    AND public.within_rider_radius(
          (pickup_location ->> 'latitude')::double precision,
          (pickup_location ->> 'longitude')::double precision
        )
  )
  WITH CHECK (rider_id = auth.uid());

-- Riders see the customer/vendor on an order waiting for a rider only when
-- that order is within their radius
CREATE OR REPLACE FUNCTION public.shares_order_with(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE p_profile_id IN (o.customer_id, o.vendor_id, o.rider_id)
      AND (
        auth.uid() IN (o.customer_id, o.vendor_id, o.rider_id)
        OR (
          o.rider_id IS NULL
          AND o.payment_status = 'paid'
          AND o.status IN ('accepted', 'processing', 'ready', 'ready_for_pickup')
          AND public.current_user_role() = 'rider'
          AND public.order_pickup_within_rider_radius(o.id)
        )
      )
  );
$$;
