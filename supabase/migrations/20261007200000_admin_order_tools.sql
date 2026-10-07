-- ===================================================================
-- Admin order tools: relieve a rider, reassign an order
--
-- relieve:  the order goes back to ready_for_pickup for other riders, at the
--           top of their Available Orders (dispatch_priority), and nearby
--           riders are alerted again. The relieved rider is told why.
-- reassign: the admin picks a verified rider with no other active delivery;
--           the order is theirs straight away.
-- Either way the pickup code is replaced, so the previous rider's code no
-- longer works. See docs/ORDER_FLOW.md → Admin tools.
-- ===================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dispatch_priority INTEGER NOT NULL DEFAULT 0;

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
  ) THEN
    RAISE EXCEPTION 'Order prices and delivery details can''t be changed after the order is placed';
  END IF;
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.replace_pickup_code(p_order_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.order_handover_codes
  SET code = public.new_handover_code(), failed_attempts = 0, used_at = NULL
  WHERE order_id = p_order_id AND kind = 'pickup';
$$;

REVOKE EXECUTE ON FUNCTION public.replace_pickup_code(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_relieve_rider(p_order_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_reason TEXT := NULLIF(trim(p_reason), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can relieve riders';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Give a reason';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.status NOT IN ('rider_assigned', 'picking_up') OR o.rider_id IS NULL THEN
    RAISE EXCEPTION 'A rider can only be relieved before they collect the order';
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);
  UPDATE public.orders
  SET rider_id = NULL, status = 'ready_for_pickup', rider_assigned_at = NULL, pickup_started_at = NULL,
      dispatch_priority = dispatch_priority + 1
  WHERE id = o.id;
  UPDATE public.deliveries
  SET rider_id = NULL, status = 'available', accepted_at = NULL, picking_up_at = NULL
  WHERE order_id = o.id;
  PERFORM public.replace_pickup_code(o.id);

  PERFORM public.notify_user(o.rider_id, 'relieved', 'Removed from an order',
    'An admin removed you from order #' || o.order_number || ': ' || v_reason, o);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_relieve_rider(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_relieve_rider(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reassign_order(p_order_id UUID, p_rider_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
             AND status IN ('rider_assigned', 'picking_up', 'out_for_delivery')) THEN
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reassign_order(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reassign_order(UUID, UUID, TEXT) TO authenticated;

-- Verified riders for the reassign picker: online first, then nearest to the
-- pickup; busy riders are marked
CREATE OR REPLACE FUNCTION public.admin_rider_candidates(p_order_id UUID)
RETURNS TABLE (
  rider_id UUID,
  name TEXT,
  phone TEXT,
  online BOOLEAN,
  distance_km NUMERIC,
  busy BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
                 AND x.status IN ('rider_assigned', 'picking_up', 'out_for_delivery'))
  FROM public.verifications v
  JOIN public.profiles p ON p.id = v.profile_id
  LEFT JOIN public.rider_profiles rp ON rp.id = p.id
  WHERE v.role = 'rider' AND v.status = 'verified'
  ORDER BY 6, 4 DESC, 5 NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_rider_candidates(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_rider_candidates(UUID) TO authenticated;
