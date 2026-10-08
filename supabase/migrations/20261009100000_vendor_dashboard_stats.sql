-- ===================================================================
-- Vendor dashboard figures
--   The dashboard read vendor_stats, which nothing ever updated, so its
--   Orders, Revenue, Carbon and Rating cards never changed. They're now
--   calculated from the vendor's real orders and ratings.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.vendor_dashboard_stats()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    -- Paid customer orders (rider requests are the vendor's own deliveries, not sales)
    'total_orders', (
      SELECT count(*) FROM public.orders
      WHERE vendor_id = auth.uid() AND order_type = 'customer'
        AND payment_status IN ('paid', 'refunded') AND status NOT IN ('cancelled', 'rejected')
    ),
    'delivered_orders', (
      SELECT count(*) FROM public.orders
      WHERE vendor_id = auth.uid() AND order_type = 'customer' AND status = 'delivered'
    ),
    -- What the vendor has been paid: items total minus Cydex's commission, on delivered orders
    'total_revenue', (
      SELECT COALESCE(sum(h.vendor_amount), 0)
      FROM public.orders o JOIN public.payment_holds h ON h.order_id = o.id
      WHERE o.vendor_id = auth.uid() AND o.order_type = 'customer' AND o.status = 'delivered'
    ),
    'total_carbon_saved', (
      SELECT COALESCE(sum(d.carbon_saved), 0)
      FROM public.orders o JOIN public.deliveries d ON d.order_id = o.id
      WHERE o.vendor_id = auth.uid() AND o.status = 'delivered'
    ),
    -- Same numbers customers see (hidden reviews don't count)
    'rating', (SELECT COALESCE(round(avg(rating)::numeric, 1), 0) FROM public.vendor_ratings
               WHERE vendor_id = auth.uid() AND hidden_at IS NULL),
    'rating_count', (SELECT count(*) FROM public.vendor_ratings WHERE vendor_id = auth.uid() AND hidden_at IS NULL)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.vendor_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_dashboard_stats() TO authenticated;
