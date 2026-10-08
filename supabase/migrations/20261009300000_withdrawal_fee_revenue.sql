-- ===================================================================
-- Withdrawal fees count as Cydex revenue on the admin Overview
--   The 1.5% fee on paid-out withdrawals (it covers Squad's transfer
--   charge) is added to Total revenue, the chart, and its own line.
--   Same function as 20261008000000_admin_tools.sql plus payout_fees.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(p_from TIMESTAMPTZ DEFAULT NULL, p_to TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ := COALESCE(p_to, now());
  v_bucket TEXT;
  v JSONB;
BEGIN
  PERFORM public.require_admin();
  v_from := COALESCE(p_from, (SELECT min(created_at) FROM public.orders), now());
  v_bucket := CASE WHEN v_to - v_from > interval '93 days' THEN 'month' ELSE 'day' END;

  WITH paid AS (
    -- every order that was paid for in the period (including ones refunded later)
    SELECT o.id, o.order_type, o.total_amount, o.payment_status,
           COALESCE(h.created_at, o.created_at) AS paid_at
    FROM public.orders o
    LEFT JOIN public.payment_holds h ON h.order_id = o.id
    WHERE o.payment_status IN ('paid', 'refunded')
      AND COALESCE(h.created_at, o.created_at) >= v_from AND COALESCE(h.created_at, o.created_at) < v_to
  ),
  delivered AS (
    SELECT * FROM public.order_money_split WHERE delivered_at >= v_from AND delivered_at < v_to
  ),
  -- Withdrawal fees Cydex kept: only on withdrawals actually paid out
  -- (failed or rejected ones are refunded in full, fee included)
  payout_fees AS (
    SELECT fee, processed_at FROM (
      SELECT fee, processed_at, status FROM public.vendor_payout_requests
      UNION ALL SELECT fee, processed_at, status FROM public.rider_payout_requests
      UNION ALL SELECT fee, processed_at, status FROM public.customer_withdrawal_requests
    ) x
    WHERE status = 'completed' AND processed_at >= v_from AND processed_at < v_to
  ),
  buckets AS (
    SELECT generate_series(date_trunc(v_bucket, v_from), date_trunc(v_bucket, v_to),
                           CASE WHEN v_bucket = 'month' THEN interval '1 month' ELSE interval '1 day' END) AS b
  )
  SELECT jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'bucket', v_bucket,
    'transactions', jsonb_build_object(
      'count', (SELECT count(*) FROM paid),
      'amount', (SELECT COALESCE(sum(total_amount), 0) FROM paid),
      'refunded_count', (SELECT count(*) FROM paid WHERE payment_status = 'refunded'),
      'refunded_amount', (SELECT COALESCE(sum(total_amount), 0) FROM paid WHERE payment_status = 'refunded'),
      'rider_requests', (SELECT count(*) FROM paid WHERE order_type = 'rider_request')
    ),
    'delivered_orders', (SELECT count(*) FROM delivered),
    'revenue', jsonb_build_object(
      'from_customers', (SELECT COALESCE(sum(cydex_from_customer), 0) FROM delivered),
      'from_vendors', (SELECT COALESCE(sum(cydex_from_vendor), 0) FROM delivered),
      'from_riders', (SELECT COALESCE(sum(cydex_from_rider), 0) FROM delivered),
      'from_withdrawals', (SELECT COALESCE(sum(fee), 0) FROM payout_fees),
      'withdrawals_paid', (SELECT count(*) FROM payout_fees),
      'total', (SELECT COALESCE(sum(cydex_total), 0) FROM delivered) + (SELECT COALESCE(sum(fee), 0) FROM payout_fees),
      'paid_to_vendors', (SELECT COALESCE(sum(vendor_got), 0) FROM delivered),
      'paid_to_riders', (SELECT COALESCE(sum(rider_got), 0) FROM delivered)
    ),
    -- right now (not tied to the period)
    'orders_today', (SELECT count(*) FROM public.orders o LEFT JOIN public.payment_holds h ON h.order_id = o.id
                     WHERE o.payment_status IN ('paid', 'refunded') AND COALESCE(h.created_at, o.created_at) >= date_trunc('day', now())),
    'active_deliveries', (SELECT count(*) FROM public.orders WHERE status IN ('rider_assigned', 'picking_up', 'out_for_delivery')),
    'awaiting_rider', (SELECT count(*) FROM public.orders WHERE status = 'ready_for_pickup' AND rider_id IS NULL),
    'online_riders', (SELECT count(*) FROM public.rider_profiles rp WHERE rp.rider_status = 'available' AND public.is_verified_rider(rp.id)),
    'pending_verifications', (SELECT count(*) FROM public.verifications WHERE status = 'pending'),
    'pending_payouts', (
      SELECT jsonb_build_object('count', count(*), 'amount', COALESCE(sum(amount), 0)) FROM (
        SELECT amount FROM public.vendor_payout_requests WHERE status = 'pending'
        UNION ALL SELECT amount FROM public.rider_payout_requests WHERE status = 'pending'
        UNION ALL SELECT amount FROM public.customer_withdrawal_requests WHERE status = 'pending'
      ) x
    ),
    'held_funds', (SELECT COALESCE(sum(total_amount), 0) FROM public.payment_holds WHERE status = 'held'),
    'failed_emails', (SELECT count(*) FROM public.email_outbox WHERE status = 'failed'),
    'series', (
      SELECT jsonb_agg(jsonb_build_object(
        'period', bk.b,
        'transactions', (SELECT COALESCE(sum(total_amount), 0) FROM paid p WHERE date_trunc(v_bucket, p.paid_at) = bk.b),
        'orders', (SELECT count(*) FROM paid p WHERE date_trunc(v_bucket, p.paid_at) = bk.b),
        'revenue', (SELECT COALESCE(sum(cydex_total), 0) FROM delivered d WHERE date_trunc(v_bucket, d.delivered_at) = bk.b)
                 + (SELECT COALESCE(sum(fee), 0) FROM payout_fees pf WHERE date_trunc(v_bucket, pf.processed_at) = bk.b)
      ) ORDER BY bk.b)
      FROM buckets bk
    )
  ) INTO v;
  RETURN v;
END;
$$;
