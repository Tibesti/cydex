-- ===================================================================
-- Admin tools
--   - activity log for every admin action (audit_logs)
--   - dashboard figures and "orders needing attention"
--   - cancel & refund an order, unlock a handover code
--   - withdrawals wait for admin approval (approve / reject)
--   - wallets and payouts lists
--   - pricing settings with history
--   - suspend / reinstate customers
--   - hide / unhide reviews (hidden ones stop counting)
--   - retry failed emails
-- See docs/ADMIN.md.
-- ===================================================================

-- Every admin function records what it did
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action TEXT, p_target_type TEXT, p_target_id TEXT, p_old JSONB DEFAULT NULL, p_new JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_logs (admin_id, action, target_type, target_id, old_values, new_values)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_old, p_new);
$$;

REVOKE EXECUTE ON FUNCTION public.log_admin_action(TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can do this';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.require_admin() FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- 1. Dashboard
-- ===================================================================

-- Money split of every delivered order (who paid, who got what, Cydex's cut
-- from each side). Cydex's cut comes from:
--   customer: the Service Charge (customer orders)
--   vendor:   the commission on items, or the rider-request commission
--   rider:    the part of the delivery fee riders don't get
CREATE OR REPLACE VIEW public.order_money_split
WITH (security_invoker = true)
AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.order_type,
  o.delivered_at,
  o.customer_id,
  o.vendor_id,
  o.rider_id,
  CASE WHEN o.order_type = 'rider_request' THEN 'vendor' ELSE 'customer' END AS paid_by,
  COALESCE(o.total_amount, 0) AS amount_paid,
  COALESCE(h.vendor_amount, 0) AS vendor_got,
  COALESCE(h.rider_amount, 0) AS rider_got,
  CASE WHEN o.order_type = 'rider_request' THEN 0 ELSE COALESCE(o.service_charge, 0) END AS cydex_from_customer,
  COALESCE(h.platform_fee, 0)
    + CASE WHEN o.order_type = 'rider_request' THEN COALESCE(o.service_charge, 0) ELSE 0 END AS cydex_from_vendor,
  COALESCE(o.delivery_fee, 0) - COALESCE(h.rider_amount, 0) AS cydex_from_rider,
  COALESCE(o.service_charge, 0) + COALESCE(h.platform_fee, 0)
    + COALESCE(o.delivery_fee, 0) - COALESCE(h.rider_amount, 0) AS cydex_total
FROM public.orders o
LEFT JOIN public.payment_holds h ON h.order_id = o.id
WHERE o.status = 'delivered';

REVOKE ALL ON public.order_money_split FROM PUBLIC, anon, authenticated;

-- Overview figures for a period (p_from/p_to NULL = all time). The chart is
-- daily for up to ~3 months, monthly beyond that.
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
      'total', (SELECT COALESCE(sum(cydex_total), 0) FROM delivered),
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
      ) ORDER BY bk.b)
      FROM buckets bk
    )
  ) INTO v;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- The breakdown table: one row per delivered order, newest first, with the
-- period's totals on every row (sum_*)
CREATE OR REPLACE FUNCTION public.admin_earnings(
  p_from TIMESTAMPTZ DEFAULT NULL, p_to TIMESTAMPTZ DEFAULT NULL, p_order_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  order_id UUID, order_number TEXT, order_type TEXT, delivered_at TIMESTAMPTZ, paid_by TEXT, payer_name TEXT,
  vendor_name TEXT, rider_name TEXT,
  amount_paid NUMERIC, vendor_got NUMERIC, rider_got NUMERIC,
  cydex_from_customer NUMERIC, cydex_from_vendor NUMERIC, cydex_from_rider NUMERIC, cydex_total NUMERIC,
  total_count BIGINT,
  sum_amount_paid NUMERIC, sum_vendor_got NUMERIC, sum_rider_got NUMERIC,
  sum_cydex_from_customer NUMERIC, sum_cydex_from_vendor NUMERIC, sum_cydex_from_rider NUMERIC, sum_cydex_total NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT m.order_id, m.order_number, m.order_type, m.delivered_at, m.paid_by,
         CASE WHEN m.paid_by = 'vendor' THEN v.name ELSE c.name END, v.name, r.name,
         m.amount_paid, m.vendor_got, m.rider_got, m.cydex_from_customer, m.cydex_from_vendor, m.cydex_from_rider, m.cydex_total,
         count(*) OVER (),
         sum(m.amount_paid) OVER (), sum(m.vendor_got) OVER (), sum(m.rider_got) OVER (),
         sum(m.cydex_from_customer) OVER (), sum(m.cydex_from_vendor) OVER (), sum(m.cydex_from_rider) OVER (),
         sum(m.cydex_total) OVER ()
  FROM public.order_money_split m
  LEFT JOIN public.profiles c ON c.id = m.customer_id
  LEFT JOIN public.profiles v ON v.id = m.vendor_id
  LEFT JOIN public.profiles r ON r.id = m.rider_id
  WHERE (p_from IS NULL OR m.delivered_at >= p_from)
    AND (p_to IS NULL OR m.delivered_at < p_to)
    AND (p_order_type IS NULL OR m.order_type = p_order_type)
  ORDER BY m.delivered_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_earnings(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_earnings(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER, INTEGER) TO authenticated;

-- Orders that look stuck, with the reason
CREATE OR REPLACE FUNCTION public.admin_orders_needing_attention()
RETURNS TABLE (
  order_id UUID,
  order_number TEXT,
  order_type TEXT,
  status TEXT,
  reason TEXT,
  since TIMESTAMPTZ,
  vendor_name TEXT,
  rider_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT o.id, o.order_number, o.order_type, o.status, x.reason, x.since, v.name, r.name
  FROM public.orders o
  CROSS JOIN LATERAL (
    SELECT * FROM (VALUES
      (o.status = 'pending' AND o.payment_status = 'paid'
         AND COALESCE((SELECT h.created_at FROM public.payment_holds h WHERE h.order_id = o.id), o.created_at) < now() - interval '15 minutes',
       'Vendor hasn''t accepted', COALESCE((SELECT h.created_at FROM public.payment_holds h WHERE h.order_id = o.id), o.created_at)),
      (o.status = 'accepted' AND o.vendor_accepted_at < now() - interval '45 minutes',
       'Not marked ready', o.vendor_accepted_at),
      (o.status = 'ready_for_pickup' AND o.rider_id IS NULL AND o.ready_for_pickup_at < now() - interval '20 minutes',
       'No rider yet', o.ready_for_pickup_at),
      (o.status = 'rider_assigned' AND o.rider_assigned_at < now() - interval '30 minutes',
       'Rider hasn''t set off', o.rider_assigned_at),
      (o.status = 'picking_up' AND o.pickup_started_at < now() - interval '45 minutes',
       'Rider hasn''t collected it', o.pickup_started_at),
      (o.status = 'out_for_delivery' AND o.picked_up_at < now() - interval '60 minutes',
       'Delivery is taking long', o.picked_up_at),
      (EXISTS (SELECT 1 FROM public.order_handover_codes c WHERE c.order_id = o.id AND c.failed_attempts >= 5 AND c.used_at IS NULL)
         AND o.status NOT IN ('delivered', 'cancelled', 'rejected'),
       'Handover code locked', o.updated_at)
    ) AS t(hit, reason, since)
    WHERE t.hit
  ) x
  LEFT JOIN public.profiles v ON v.id = o.vendor_id
  LEFT JOIN public.profiles r ON r.id = o.rider_id
  ORDER BY x.since;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_orders_needing_attention() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_orders_needing_attention() TO authenticated;

-- ===================================================================
-- 2. Orders: cancel & refund, unlock a handover code
-- ===================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT;

CREATE OR REPLACE FUNCTION public.admin_cancel_order(p_order_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_reason TEXT := NULLIF(trim(p_reason), '');
BEGIN
  PERFORM public.require_admin();
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Give a reason';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.status IN ('delivered', 'cancelled', 'rejected') THEN
    RAISE EXCEPTION 'This order is already closed';
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);
  UPDATE public.orders
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason, cancelled_by = 'admin'
  WHERE id = o.id;
  UPDATE public.deliveries SET status = 'cancelled', cancelled_at = now()
  WHERE order_id = o.id AND status NOT IN ('delivered', 'cancelled');

  -- Paid money goes back (customer wallet, or the vendor's for a rider request)
  PERFORM public.refund_order(o.id);
  PERFORM public.log_admin_action('cancel_order', 'order', o.id::text,
    jsonb_build_object('status', o.status, 'payment_status', o.payment_status), jsonb_build_object('reason', v_reason));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_cancel_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_order(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unlock_handover_code(p_order_id UUID, p_kind TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  UPDATE public.order_handover_codes SET failed_attempts = 0
  WHERE order_id = p_order_id AND kind = p_kind;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No % code for this order', p_kind;
  END IF;
  PERFORM public.log_admin_action('unlock_handover_code', 'order', p_order_id::text, NULL, jsonb_build_object('kind', p_kind));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_unlock_handover_code(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unlock_handover_code(UUID, TEXT) TO authenticated;

-- Orders list: search by order number, customer, vendor, rider or recipient
-- (rider requests); filter by status and type
CREATE OR REPLACE FUNCTION public.admin_orders(
  p_search TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL, p_order_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, order_number TEXT, order_type TEXT, status TEXT, payment_status TEXT, total_amount NUMERIC,
  created_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, customer_name TEXT, recipient_name TEXT,
  vendor_name TEXT, rider_id UUID, rider_name TEXT, item_count BIGINT, total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q TEXT := NULLIF(trim(p_search), '');
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT o.id, o.order_number, o.order_type, o.status, o.payment_status, o.total_amount, o.created_at, o.delivered_at,
         c.name, o.delivery_address ->> 'name', v.name, o.rider_id, r.name,
         (SELECT count(*) FROM public.order_items i WHERE i.order_id = o.id),
         count(*) OVER ()
  FROM public.orders o
  LEFT JOIN public.profiles c ON c.id = o.customer_id
  LEFT JOIN public.profiles v ON v.id = o.vendor_id
  LEFT JOIN public.profiles r ON r.id = o.rider_id
  WHERE (p_status IS NULL OR o.status = p_status)
    AND (p_order_type IS NULL OR o.order_type = p_order_type)
    AND (v_q IS NULL OR o.order_number ILIKE '%' || v_q || '%' OR c.name ILIKE '%' || v_q || '%'
         OR c.email ILIKE '%' || v_q || '%' OR v.name ILIKE '%' || v_q || '%' OR r.name ILIKE '%' || v_q || '%'
         OR o.delivery_address ->> 'name' ILIKE '%' || v_q || '%' OR o.delivery_address ->> 'phone' ILIKE '%' || v_q || '%')
  ORDER BY o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_orders(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_orders(TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- Everything an admin needs on one order (customer orders and rider requests).
-- Handover codes are reported by status only; admins never see the digits.
CREATE OR REPLACE FUNCTION public.admin_order_detail(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  v JSONB;
BEGIN
  PERFORM public.require_admin();
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF o.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT jsonb_build_object(
    'order', to_jsonb(o) - 'verification_code',
    'customer', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'phone', p.phone, 'status', p.status)
                 FROM public.profiles p WHERE p.id = o.customer_id),
    'vendor', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'phone', p.phone,
                 'verification_status', (SELECT status FROM public.verifications WHERE profile_id = p.id))
               FROM public.profiles p WHERE p.id = o.vendor_id),
    'rider', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'phone', p.phone,
                'vehicle_type', rp.vehicle_type, 'rating', rp.rating, 'rider_status', rp.rider_status)
              FROM public.profiles p LEFT JOIN public.rider_profiles rp ON rp.id = p.id WHERE p.id = o.rider_id),
    'pickup', COALESCE(
      (SELECT d.pickup_location FROM public.deliveries d WHERE d.order_id = o.id AND d.pickup_location IS NOT NULL LIMIT 1),
      (SELECT to_jsonb(a) - 'profile_id' FROM public.addresses a WHERE a.profile_id = o.vendor_id
       ORDER BY a.is_default DESC NULLS LAST, a.created_at LIMIT 1)),
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', i.product_name, 'quantity', i.quantity,
                         'unit_price', i.unit_price, 'total_price', i.total_price) ORDER BY i.created_at)
                       FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb),
    'hold', (SELECT jsonb_build_object('status', h.status, 'total_amount', h.total_amount, 'vendor_amount', h.vendor_amount,
               'rider_amount', h.rider_amount, 'platform_fee', h.platform_fee, 'created_at', h.created_at,
               'vendor_released_at', h.vendor_released_at, 'rider_released_at', h.rider_released_at)
             FROM public.payment_holds h WHERE h.order_id = o.id),
    'split', (SELECT to_jsonb(m) - 'order_id' - 'customer_id' - 'vendor_id' - 'rider_id'
              FROM public.order_money_split m WHERE m.order_id = o.id),
    'codes', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', c.kind, 'failed_attempts', c.failed_attempts,
                         'used_at', c.used_at, 'created_at', c.created_at, 'locked', c.failed_attempts >= 5 AND c.used_at IS NULL)
                         ORDER BY c.kind DESC)
                       FROM public.order_handover_codes c WHERE c.order_id = o.id), '[]'::jsonb),
    'delivery', (SELECT jsonb_build_object('status', d.status, 'accepted_at', d.accepted_at, 'picking_up_at', d.picking_up_at,
                   'picked_up_at', d.picked_up_at, 'delivered_at', d.delivered_at, 'cancelled_at', d.cancelled_at,
                   'rider_earning', d.rider_earning)
                 FROM public.deliveries d WHERE d.order_id = o.id ORDER BY d.created_at DESC LIMIT 1),
    'transactions', COALESCE((SELECT jsonb_agg(t ORDER BY t->>'created_at') FROM (
        SELECT jsonb_build_object('who', 'customer', 'type', type, 'amount', amount, 'status', status, 'description', description, 'created_at', created_at) t
        FROM public.customer_transactions WHERE reference_id = o.id
        UNION ALL
        SELECT jsonb_build_object('who', 'vendor', 'type', type, 'amount', COALESCE(net_amount, amount), 'status', status, 'description', description, 'created_at', created_at)
        FROM public.vendor_transactions WHERE reference_id = o.id
        UNION ALL
        SELECT jsonb_build_object('who', 'rider', 'type', type, 'amount', COALESCE(net_amount, amount), 'status', status, 'description', description, 'created_at', created_at)
        FROM public.rider_transactions WHERE reference_id = o.id
      ) x), '[]'::jsonb),
    'ratings', jsonb_build_object(
      'vendor', (SELECT jsonb_build_object('rating', r.rating, 'feedback', r.feedback, 'hidden_at', r.hidden_at)
                 FROM public.vendor_ratings r WHERE r.order_id = o.id LIMIT 1),
      'rider', (SELECT jsonb_build_object('rating', r.rating, 'feedback', r.feedback, 'hidden_at', r.hidden_at)
                FROM public.rider_ratings r WHERE r.order_id = o.id LIMIT 1)),
    'admin_actions', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', l.action, 'admin', a.name, 'details', l.new_values,
                                 'created_at', l.created_at) ORDER BY l.created_at)
                               FROM public.audit_logs l LEFT JOIN public.profiles a ON a.id = l.admin_id
                               WHERE l.target_type = 'order' AND l.target_id = o.id::text), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_order_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_order_detail(UUID) TO authenticated;

-- ===================================================================
-- 3. Withdrawals wait for an admin
--    request_payout() takes the money from the wallet and leaves the
--    request 'pending'. An admin approves (squad-payout sends the transfer)
--    or rejects ('cancelled', money back with the reason).
-- ===================================================================

CREATE OR REPLACE FUNCTION public.notify_payout_requested()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID := COALESCE(
    to_jsonb(NEW) ->> 'vendor_id', to_jsonb(NEW) ->> 'rider_id', to_jsonb(NEW) ->> 'customer_id')::uuid;
BEGIN
  PERFORM public.notify_user(v_owner, 'payout_requested', 'Withdrawal requested',
    '₦' || to_char(NEW.amount, 'FM999,999,990.00') || ' is waiting for approval. We''ll let you know when it''s sent.');
  PERFORM public.notify_admins('payout_request', 'Withdrawal to approve',
    COALESCE((SELECT name FROM public.profiles WHERE id = v_owner), 'Someone') || ' asked to withdraw ₦'
    || to_char(NEW.amount, 'FM999,999,990.00') || '.');
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_payout_requested AFTER INSERT ON public.vendor_payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_payout_requested();
CREATE TRIGGER notify_payout_requested AFTER INSERT ON public.rider_payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_payout_requested();
CREATE TRIGGER notify_payout_requested AFTER INSERT ON public.customer_withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_payout_requested();

CREATE OR REPLACE FUNCTION public.admin_reject_payout(p_role TEXT, p_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_reason TEXT := NULLIF(trim(p_reason), '');
BEGIN
  PERFORM public.require_admin();
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Give a reason';
  END IF;
  SELECT status INTO v_status FROM (
    SELECT status FROM public.vendor_payout_requests WHERE p_role = 'vendor' AND id = p_id
    UNION ALL SELECT status FROM public.rider_payout_requests WHERE p_role = 'rider' AND id = p_id
    UNION ALL SELECT status FROM public.customer_withdrawal_requests WHERE p_role = 'customer' AND id = p_id
  ) x;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Only withdrawals waiting for approval can be rejected';
  END IF;
  PERFORM public.settle_payout(p_role, p_id, 'cancelled', NULL, NULL, v_reason);
  PERFORM public.log_admin_action('reject_payout', p_role || '_payout', p_id::text, NULL, jsonb_build_object('reason', v_reason));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reject_payout(TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_payout(TEXT, UUID, TEXT) TO authenticated;

-- All withdrawals in one list (newest first), with the bank account
CREATE OR REPLACE FUNCTION public.admin_payouts(p_status TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  role TEXT, id UUID, owner_id UUID, owner_name TEXT, owner_email TEXT,
  bank_name TEXT, account_number TEXT, account_name TEXT,
  amount NUMERIC, fee NUMERIC, net_amount NUMERIC, status TEXT, failure_reason TEXT,
  transfer_reference TEXT, created_at TIMESTAMPTZ, processed_at TIMESTAMPTZ, total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  WITH all_payouts AS (
    SELECT 'vendor'::text AS role, p.id, p.vendor_id AS owner_id, b.bank_name, b.account_number, b.account_name,
           p.amount, p.fee, p.net_amount, p.status, p.failure_reason, p.transfer_reference, p.created_at, p.processed_at
    FROM public.vendor_payout_requests p LEFT JOIN public.vendor_bank_accounts b ON b.id = p.bank_account_id
    UNION ALL
    SELECT 'rider', p.id, p.rider_id, b.bank_name, b.account_number, b.account_name,
           p.amount, p.fee, p.net_amount, p.status, p.failure_reason, p.transfer_reference, p.created_at, p.processed_at
    FROM public.rider_payout_requests p LEFT JOIN public.rider_bank_details b ON b.id = p.bank_account_id
    UNION ALL
    SELECT 'customer', p.id, p.customer_id, b.bank_name, b.account_number, b.account_name,
           p.amount, p.fee, p.net_amount, p.status, p.failure_reason, p.transfer_reference, p.created_at, p.processed_at
    FROM public.customer_withdrawal_requests p LEFT JOIN public.customer_bank_accounts b ON b.id = p.bank_account_id
  )
  SELECT a.role, a.id, a.owner_id, pr.name, pr.email, a.bank_name, a.account_number, a.account_name,
         a.amount, a.fee, a.net_amount, a.status, a.failure_reason, a.transfer_reference, a.created_at, a.processed_at,
         count(*) OVER ()
  FROM all_payouts a
  LEFT JOIN public.profiles pr ON pr.id = a.owner_id
  WHERE p_status IS NULL OR a.status = p_status
  ORDER BY a.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_payouts(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_payouts(TEXT, INTEGER, INTEGER) TO authenticated;

-- Everyone's wallet balance in one list
CREATE OR REPLACE FUNCTION public.admin_wallets(p_role TEXT DEFAULT NULL, p_search TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  role TEXT, profile_id UUID, name TEXT, email TEXT, available_balance NUMERIC, total_earned NUMERIC,
  total_withdrawn NUMERIC, updated_at TIMESTAMPTZ, total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  WITH w AS (
    SELECT 'customer'::text AS kind, cw.customer_id AS pid, cw.available_balance AS bal, NULL::numeric AS earned, NULL::numeric AS withdrawn, cw.updated_at AS changed FROM public.customer_wallet cw
    UNION ALL SELECT 'vendor', vw.vendor_id, vw.available_balance, vw.total_earned, vw.total_withdrawn, vw.updated_at FROM public.vendor_wallet vw
    UNION ALL SELECT 'rider', rw.rider_id, rw.available_balance, rw.total_earned, rw.total_withdrawn, rw.updated_at FROM public.rider_wallet rw
  )
  SELECT w.kind, w.pid, p.name, p.email, w.bal, w.earned, w.withdrawn, w.changed, count(*) OVER ()
  FROM w JOIN public.profiles p ON p.id = w.pid
  WHERE (p_role IS NULL OR w.kind = p_role)
    AND (NULLIF(trim(p_search), '') IS NULL OR p.name ILIKE '%' || trim(p_search) || '%' OR p.email ILIKE '%' || trim(p_search) || '%')
  ORDER BY w.bal DESC NULLS LAST, p.name
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_wallets(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_wallets(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ===================================================================
-- 4. Pricing settings (each change is a new pricing_config row: the
--    newest is used, older rows are the history)
-- ===================================================================

ALTER TABLE public.pricing_config ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.pricing_config ADD COLUMN IF NOT EXISTS note TEXT;

CREATE OR REPLACE FUNCTION public.admin_update_pricing(
  p_base_rate NUMERIC,
  p_distance_rate_per_km NUMERIC,
  p_service_charge_rate NUMERIC,
  p_vendor_commission_rate NUMERIC,
  p_rider_share_rate NUMERIC,
  p_rider_request_commission_rate NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur public.pricing_config%ROWTYPE;
BEGIN
  PERFORM public.require_admin();
  IF p_base_rate IS NULL OR p_base_rate < 0 OR p_base_rate > 100000 THEN
    RAISE EXCEPTION 'Minimum fare must be between ₦0 and ₦100,000';
  END IF;
  IF p_distance_rate_per_km IS NULL OR p_distance_rate_per_km < 0 OR p_distance_rate_per_km > 100000 THEN
    RAISE EXCEPTION 'Price per km must be between ₦0 and ₦100,000';
  END IF;
  IF p_service_charge_rate IS NULL OR p_service_charge_rate < 0 OR p_service_charge_rate > 0.5 THEN
    RAISE EXCEPTION 'Service Charge must be between 0%% and 50%%';
  END IF;
  IF p_vendor_commission_rate IS NULL OR p_vendor_commission_rate < 0 OR p_vendor_commission_rate > 0.5 THEN
    RAISE EXCEPTION 'Vendor commission must be between 0%% and 50%%';
  END IF;
  IF p_rider_share_rate IS NULL OR p_rider_share_rate < 0.5 OR p_rider_share_rate > 1 THEN
    RAISE EXCEPTION 'Rider share must be between 50%% and 100%%';
  END IF;
  IF p_rider_request_commission_rate IS NULL OR p_rider_request_commission_rate < 0 OR p_rider_request_commission_rate > 0.5 THEN
    RAISE EXCEPTION 'Rider request commission must be between 0%% and 50%%';
  END IF;

  SELECT * INTO cur FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.pricing_config (
    base_rate, distance_rate_per_km, weight_rates, late_night_fee, surge_multiplier, student_discount_percent,
    green_fee, subscription_monthly_rate, service_charge_rate, rider_share_rate, vendor_commission_rate,
    rider_request_commission_rate, created_by, note, created_at
  ) VALUES (
    p_base_rate, p_distance_rate_per_km, cur.weight_rates, cur.late_night_fee, cur.surge_multiplier,
    cur.student_discount_percent, cur.green_fee, cur.subscription_monthly_rate, p_service_charge_rate,
    p_rider_share_rate, p_vendor_commission_rate, p_rider_request_commission_rate, auth.uid(),
    NULLIF(trim(p_note), ''), clock_timestamp()
  );

  PERFORM public.log_admin_action('update_pricing', 'pricing_config', NULL,
    jsonb_build_object('base_rate', cur.base_rate, 'distance_rate_per_km', cur.distance_rate_per_km,
      'service_charge_rate', cur.service_charge_rate, 'vendor_commission_rate', cur.vendor_commission_rate,
      'rider_share_rate', cur.rider_share_rate, 'rider_request_commission_rate', cur.rider_request_commission_rate),
    jsonb_build_object('base_rate', p_base_rate, 'distance_rate_per_km', p_distance_rate_per_km,
      'service_charge_rate', p_service_charge_rate, 'vendor_commission_rate', p_vendor_commission_rate,
      'rider_share_rate', p_rider_share_rate, 'rider_request_commission_rate', p_rider_request_commission_rate,
      'note', NULLIF(trim(p_note), '')));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_pricing(NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_pricing(NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ===================================================================
-- 5. Users: one list with verification status; suspend customers.
--    Admins are invited through the admin-team Edge Function (it needs the
--    service key to send the invite email); "joined" = signed in at least once.
-- ===================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE OR REPLACE FUNCTION public.admin_users(p_search TEXT DEFAULT NULL, p_role TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  id UUID, name TEXT, email TEXT, phone TEXT, role TEXT, status TEXT, suspension_reason TEXT,
  verification_status TEXT, created_at TIMESTAMPTZ, last_login_at TIMESTAMPTZ, joined BOOLEAN, total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT p.id, p.name, p.email, p.phone, lower(p.role), COALESCE(p.status, 'active'), p.suspension_reason,
         v.status, p.created_at, COALESCE(u.last_sign_in_at, p.last_login_at), (u.last_sign_in_at IS NOT NULL), count(*) OVER ()
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.verifications v ON v.profile_id = p.id
  WHERE (p_role IS NULL OR lower(p.role) = p_role)
    AND (NULLIF(trim(p_search), '') IS NULL OR p.name ILIKE '%' || trim(p_search) || '%'
         OR p.email ILIKE '%' || trim(p_search) || '%' OR p.phone ILIKE '%' || trim(p_search) || '%')
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_users(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_users(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- Customers only; vendors and riders are suspended through their verification
CREATE OR REPLACE FUNCTION public.admin_set_customer_suspended(p_profile_id UUID, p_suspended BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles%ROWTYPE;
  v_reason TEXT := NULLIF(trim(p_reason), '');
BEGIN
  PERFORM public.require_admin();
  SELECT * INTO p FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF p.id IS NULL OR lower(p.role) <> 'customer' THEN
    RAISE EXCEPTION 'Customer not found (suspend vendors and riders from Verifications)';
  END IF;
  IF p_suspended AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Give a reason for suspending';
  END IF;

  UPDATE public.profiles
  SET status = CASE WHEN p_suspended THEN 'suspended' ELSE 'active' END,
      suspension_reason = CASE WHEN p_suspended THEN v_reason END
  WHERE id = p_profile_id;

  IF p_suspended THEN
    PERFORM public.notify_user(p_profile_id, 'account_suspended', 'Account suspended', 'Your account has been suspended: ' || v_reason);
    PERFORM public.queue_email(p_profile_id, 'account_suspended', 'Your Cydex account has been suspended',
      jsonb_build_object('role', 'customer', 'reason', v_reason));
  ELSE
    PERFORM public.notify_user(p_profile_id, 'account_reinstated', 'Account reinstated', 'Your account is active again.');
  END IF;
  PERFORM public.log_admin_action(CASE WHEN p_suspended THEN 'suspend_customer' ELSE 'reinstate_customer' END,
    'customer', p_profile_id::text, jsonb_build_object('status', p.status), jsonb_build_object('reason', v_reason));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_customer_suspended(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_suspended(UUID, BOOLEAN, TEXT) TO authenticated;

-- Suspended customers can't place orders
CREATE OR REPLACE FUNCTION public.block_suspended_customers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.customer_id AND status = 'suspended') THEN
    RAISE EXCEPTION 'Your account is suspended';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER block_suspended_customers
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.block_suspended_customers();

-- ===================================================================
-- 6. Reviews: admins can hide abusive or fake ones (kept for the record,
--    but no longer shown or counted)
-- ===================================================================

ALTER TABLE public.vendor_ratings ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE public.vendor_ratings ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE public.vendor_ratings ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.rider_ratings ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE public.rider_ratings ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE public.rider_ratings ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.profiles(id);

DROP POLICY IF EXISTS "Anyone can view vendor ratings" ON public.vendor_ratings;
CREATE POLICY "Anyone can view vendor ratings" ON public.vendor_ratings
  FOR SELECT USING (hidden_at IS NULL OR customer_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "Riders see their ratings" ON public.rider_ratings;
CREATE POLICY "Riders see their ratings" ON public.rider_ratings
  FOR SELECT USING (rider_id = auth.uid() AND hidden_at IS NULL);

CREATE OR REPLACE FUNCTION public.get_vendor_average_rating(vendor_uuid UUID)
RETURNS TABLE (
  average_rating NUMERIC,
  total_ratings INTEGER,
  average_delivery_rating NUMERIC,
  average_product_quality_rating NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
    COUNT(*)::integer,
    COALESCE(ROUND(AVG(delivery_rating)::numeric, 2), 0),
    COALESCE(ROUND(AVG(product_quality_rating)::numeric, 2), 0)
  FROM public.vendor_ratings
  WHERE vendor_id = vendor_uuid AND hidden_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_review_hidden(p_kind TEXT, p_id UUID, p_hidden BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(trim(p_reason), '');
BEGIN
  PERFORM public.require_admin();
  IF p_hidden AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Give a reason for hiding';
  END IF;
  IF p_kind = 'vendor' THEN
    UPDATE public.vendor_ratings
    SET hidden_at = CASE WHEN p_hidden THEN now() END, hidden_reason = CASE WHEN p_hidden THEN v_reason END,
        hidden_by = CASE WHEN p_hidden THEN auth.uid() END
    WHERE id = p_id;
  ELSIF p_kind = 'rider' THEN
    UPDATE public.rider_ratings
    SET hidden_at = CASE WHEN p_hidden THEN now() END, hidden_reason = CASE WHEN p_hidden THEN v_reason END,
        hidden_by = CASE WHEN p_hidden THEN auth.uid() END
    WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Unknown review type';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found';
  END IF;
  PERFORM public.log_admin_action(CASE WHEN p_hidden THEN 'hide_review' ELSE 'unhide_review' END,
    p_kind || '_rating', p_id::text, NULL, jsonb_build_object('reason', v_reason));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_review_hidden(TEXT, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_review_hidden(TEXT, UUID, BOOLEAN, TEXT) TO authenticated;

-- ===================================================================
-- 7. Emails: retry failed ones
-- ===================================================================

CREATE OR REPLACE FUNCTION public.admin_retry_email(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  UPDATE public.email_outbox SET status = 'pending', attempts = 0, last_error = NULL
  WHERE id = p_id AND status = 'failed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only failed emails can be retried';
  END IF;
  PERFORM public.log_admin_action('retry_email', 'email', p_id::text);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_retry_email(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_retry_email(UUID) TO authenticated;

-- ===================================================================
-- 8. Existing functions, updated
--    notify_order_events: tells everyone when Cydex cancels an order
--    admin_review_verification / admin_relieve_rider / admin_reassign_order: logged
--    settle_payout: 'cancelled' (rejected by an admin) puts the money back
--    vendor cards / storefront / rider average: hidden reviews don't count
-- ===================================================================

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
      IF NEW.cancelled_by = 'admin' THEN
        PERFORM public.notify_user(NEW.customer_id, 'cancelled', 'Order cancelled by Cydex',
          'Cydex cancelled order ' || v_ref || ': ' || COALESCE(NEW.cancel_reason, 'no reason given') || '.', NEW);
        PERFORM public.notify_user(NEW.vendor_id, 'cancelled', 'Order cancelled by Cydex',
          'Cydex cancelled order ' || v_ref || ': ' || COALESCE(NEW.cancel_reason, 'no reason given') || '.', NEW);
        PERFORM public.notify_user(NEW.rider_id, 'cancelled', 'Delivery cancelled',
          'Cydex cancelled order ' || v_ref || '. You no longer need to deliver it.', NEW);
        RETURN NEW;
      END IF;
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

  PERFORM public.log_admin_action('verification_' || p_action, v.role, p_profile_id::text, jsonb_build_object('status', v.status), jsonb_build_object('status', v_status, 'reason', v_reason));
  RETURN v_status;
END;
$$;


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
  PERFORM public.log_admin_action('relieve_rider', 'order', o.id::text, jsonb_build_object('rider_id', o.rider_id, 'status', o.status), jsonb_build_object('reason', v_reason));
END;
$$;


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
  PERFORM public.log_admin_action('reassign_order', 'order', o.id::text, jsonb_build_object('rider_id', o.rider_id, 'status', o.status), jsonb_build_object('rider_id', p_rider_id, 'reason', v_reason));
END;
$$;


CREATE OR REPLACE FUNCTION public.settle_payout(
  p_role TEXT, p_id UUID, p_status TEXT, p_reference TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL, p_reason TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_amount NUMERIC;
  v_old TEXT;
BEGIN
  IF p_status NOT IN ('pending', 'processing', 'completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown payout status %', p_status;
  END IF;

  IF p_role = 'vendor' THEN
    SELECT vendor_id, amount, status INTO v_owner, v_amount, v_old FROM public.vendor_payout_requests WHERE id = p_id FOR UPDATE;
  ELSIF p_role = 'rider' THEN
    SELECT rider_id, amount, status INTO v_owner, v_amount, v_old FROM public.rider_payout_requests WHERE id = p_id FOR UPDATE;
  ELSIF p_role = 'customer' THEN
    SELECT customer_id, amount, status INTO v_owner, v_amount, v_old FROM public.customer_withdrawal_requests WHERE id = p_id FOR UPDATE;
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Payout request not found';
  END IF;
  -- Final states don't change
  IF v_old IN ('completed', 'failed', 'cancelled') THEN
    RETURN v_old;
  END IF;

  IF p_role = 'vendor' THEN
    UPDATE public.vendor_payout_requests
    SET status = p_status, transfer_reference = COALESCE(p_reference, transfer_reference),
        transfer_metadata = COALESCE(p_metadata, transfer_metadata), failure_reason = p_reason,
        processed_at = CASE WHEN p_status IN ('completed', 'failed', 'cancelled') THEN now() ELSE processed_at END, updated_at = now()
    WHERE id = p_id;
  ELSIF p_role = 'rider' THEN
    UPDATE public.rider_payout_requests
    SET status = p_status, transfer_reference = COALESCE(p_reference, transfer_reference),
        transfer_metadata = COALESCE(p_metadata, transfer_metadata), failure_reason = p_reason,
        processed_at = CASE WHEN p_status IN ('completed', 'failed', 'cancelled') THEN now() ELSE processed_at END, updated_at = now()
    WHERE id = p_id;
  ELSE
    UPDATE public.customer_withdrawal_requests
    SET status = p_status, transfer_reference = COALESCE(p_reference, transfer_reference),
        transfer_metadata = COALESCE(p_metadata, transfer_metadata), failure_reason = p_reason,
        processed_at = CASE WHEN p_status IN ('completed', 'failed', 'cancelled') THEN now() ELSE processed_at END, updated_at = now()
    WHERE id = p_id;
  END IF;

  IF p_status IN ('failed', 'cancelled') THEN
    IF p_role = 'vendor' THEN
      UPDATE public.vendor_wallet
      SET available_balance = available_balance + v_amount, total_withdrawn = total_withdrawn - v_amount, updated_at = now()
      WHERE vendor_id = v_owner;
    ELSIF p_role = 'rider' THEN
      UPDATE public.rider_wallet
      SET available_balance = available_balance + v_amount, total_withdrawn = total_withdrawn - v_amount, updated_at = now()
      WHERE rider_id = v_owner;
    ELSE
      UPDATE public.customer_wallet
      SET available_balance = available_balance + v_amount, updated_at = now()
      WHERE customer_id = v_owner;
    END IF;
    IF p_status = 'cancelled' THEN
      PERFORM public.notify_user(v_owner, 'payout_rejected', 'Withdrawal not approved',
        '₦' || to_char(v_amount, 'FM999,999,990.00') || ' is back in your wallet.' || COALESCE(' Reason: ' || p_reason, ''));
    ELSE
      PERFORM public.notify_user(v_owner, 'payout_failed', 'Withdrawal failed',
        '₦' || to_char(v_amount, 'FM999,999,990.00') || ' couldn''t be sent to your bank and is back in your wallet.'
        || COALESCE(' Reason: ' || p_reason, ''));
    END IF;
  ELSIF p_status = 'completed' THEN
    PERFORM public.notify_user(v_owner, 'payout_completed', 'Withdrawal sent',
      '₦' || to_char(v_amount, 'FM999,999,990.00') || ' has been sent to your bank account.');
  END IF;

  RETURN p_status;
END;
$$;


CREATE OR REPLACE FUNCTION public.vendor_cards_near_address(p_address_id UUID)
RETURNS TABLE (
  vendor_id UUID,
  name TEXT,
  logo_url TEXT,
  banner_url TEXT,
  verified BOOLEAN,
  distance_km NUMERIC,
  product_count INTEGER,
  categories TEXT[],
  average_rating NUMERIC,
  rating_count INTEGER,
  recent_orders INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.vendor_id,
    p.name,
    p.avatar,
    p.store_banner_url,
    COALESCE(p.verified, false),
    n.distance_km,
    (SELECT count(*)::int FROM public.products pr WHERE pr.vendor_id = n.vendor_id AND pr.status = 'active'),
    COALESCE((SELECT array_agg(DISTINCT pr.category) FROM public.products pr
              WHERE pr.vendor_id = n.vendor_id AND pr.status = 'active' AND pr.category IS NOT NULL), '{}'),
    (SELECT round(avg(r.rating)::numeric, 1) FROM public.vendor_ratings r WHERE r.vendor_id = n.vendor_id AND r.hidden_at IS NULL),
    (SELECT count(*)::int FROM public.vendor_ratings r WHERE r.vendor_id = n.vendor_id AND r.hidden_at IS NULL),
    (SELECT count(*)::int FROM public.orders o
     WHERE o.vendor_id = n.vendor_id AND o.payment_status = 'paid'
       AND o.status NOT IN ('cancelled', 'rejected')
       AND o.created_at > now() - interval '30 days')
  FROM public.vendors_near_address(p_address_id) n
  JOIN public.profiles p ON p.id = n.vendor_id
  WHERE COALESCE(p.status, 'active') = 'active';
$$;


CREATE OR REPLACE FUNCTION public.vendor_storefront(p_vendor_id UUID, p_address_id UUID DEFAULT NULL)
RETURNS TABLE (
  vendor_id UUID,
  name TEXT,
  logo_url TEXT,
  banner_url TEXT,
  verified BOOLEAN,
  store_address TEXT,
  average_rating NUMERIC,
  rating_count INTEGER,
  distance_km NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH store AS (
    SELECT * FROM public.addresses
    WHERE profile_id = p_vendor_id
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1
  ),
  dest AS (
    SELECT latitude, longitude FROM public.addresses WHERE id = p_address_id AND profile_id = auth.uid()
  )
  SELECT
    p.id,
    p.name,
    p.avatar,
    p.store_banner_url,
    COALESCE(p.verified, false),
    (SELECT s.formatted_address FROM store s),
    (SELECT round(avg(r.rating)::numeric, 1) FROM public.vendor_ratings r WHERE r.vendor_id = p.id AND r.hidden_at IS NULL),
    (SELECT count(*)::int FROM public.vendor_ratings r WHERE r.vendor_id = p.id AND r.hidden_at IS NULL),
    (SELECT round((public.distance_m(s.latitude, s.longitude, d.latitude, d.longitude) / 1000)::numeric, 2)
     FROM store s, dest d)
  FROM public.profiles p
  WHERE p.id = p_vendor_id AND lower(p.role) = 'vendor';
$$;


CREATE OR REPLACE FUNCTION public.update_rider_average_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rider_profiles
  SET rating = (SELECT round(avg(rating)::numeric, 2) FROM public.rider_ratings WHERE rider_id = NEW.rider_id AND hidden_at IS NULL),
      updated_at = now()
  WHERE id = NEW.rider_id;
  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS update_rider_average_rating ON public.rider_ratings;
CREATE TRIGGER update_rider_average_rating
  AFTER INSERT OR UPDATE OF hidden_at ON public.rider_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_rider_average_rating();

