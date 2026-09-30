-- ===================================================================
-- Riders need a phone number on their profile to accept deliveries
-- (customers and vendors call them). See docs/ORDER_FLOW.md.
-- ===================================================================

-- Rider: accept an order that's ready, within their radius (one at a time).
-- The rider must have a phone number on their profile.
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
