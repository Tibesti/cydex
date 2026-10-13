-- ===================================================================
-- Promotions and discounts
--   Admins create promotions that take a percentage or a flat amount off
--   one of: the Service Charge, the delivery fee, or the items bought from
--   one business. Optional conditions: a coupon code the customer must
--   enter, a maximum delivery distance, delivery modes (e.g. only Cydex
--   Dashers), and a start and end date.
--   One promotion per order: the coupon the customer entered, otherwise the
--   automatic one that saves them the most.
--   Who pays for it: Cydex, except an items promotion can be set to come out
--   of the business's share. Riders always get their full share of the
--   delivery fee.
--   Applies to customer orders and Cydex Express (not vendors' rider requests).
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- NULL: applied automatically. Otherwise the customer enters it at checkout.
  code TEXT UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'flat')),
  discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
  applies_to TEXT NOT NULL CHECK (applies_to IN ('service_charge', 'delivery_fee', 'items')),
  -- The business an items promotion is for
  vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  cost_bearer TEXT NOT NULL DEFAULT 'cydex' CHECK (cost_bearer IN ('cydex', 'vendor')),
  max_distance_km NUMERIC(6,2) CHECK (max_distance_km IS NULL OR max_distance_km > 0),
  -- Delivery modes it's for (NULL or empty: all)
  vehicle_types TEXT[],
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK ((applies_to = 'items') = (vendor_id IS NOT NULL)),
  CHECK (cost_bearer = 'cydex' OR applies_to = 'items')
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage promotions" ON public.promotions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
-- A business can see the promotions on its own items
CREATE POLICY "Vendors see promotions on their items" ON public.promotions
  FOR SELECT USING (vendor_id = auth.uid());

ALTER TABLE public.orders
  ADD CONSTRAINT orders_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.admin_save_promotion(
  p_id UUID,
  p_name TEXT,
  p_code TEXT,
  p_discount_type TEXT,
  p_discount_value NUMERIC,
  p_applies_to TEXT,
  p_vendor_id UUID,
  p_cost_bearer TEXT,
  p_max_distance_km NUMERIC,
  p_vehicle_types TEXT[],
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT := NULLIF(trim(p_name), '');
  v_code TEXT := NULLIF(upper(regexp_replace(COALESCE(p_code, ''), '\s', '', 'g')), '');
  v_vehicles TEXT[] := CASE WHEN COALESCE(array_length(p_vehicle_types, 1), 0) = 0 THEN NULL ELSE p_vehicle_types END;
  v_bearer TEXT := CASE WHEN p_applies_to = 'items' THEN COALESCE(p_cost_bearer, 'cydex') ELSE 'cydex' END;
  v_vendor UUID := CASE WHEN p_applies_to = 'items' THEN p_vendor_id END;
  v_old JSONB;
  v_id UUID := p_id;
BEGIN
  PERFORM public.require_admin();
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Give the promotion a name';
  END IF;
  IF p_discount_type NOT IN ('percent', 'flat') OR p_discount_value IS NULL OR p_discount_value <= 0 THEN
    RAISE EXCEPTION 'Enter the discount';
  END IF;
  IF p_discount_type = 'percent' AND p_discount_value > 100 THEN
    RAISE EXCEPTION 'A percentage discount can''t be more than 100%%';
  END IF;
  IF p_applies_to NOT IN ('service_charge', 'delivery_fee', 'items') THEN
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
  IF v_code IS NOT NULL AND v_code !~ '^[A-Z0-9_-]{3,20}$' THEN
    RAISE EXCEPTION 'A coupon code is 3 to 20 letters or numbers';
  END IF;
  IF v_code IS NOT NULL AND EXISTS (SELECT 1 FROM public.promotions WHERE code = v_code AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'That coupon code is already used by another promotion';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions (name, code, discount_type, discount_value, applies_to, vendor_id, cost_bearer,
                                   max_distance_km, vehicle_types, starts_at, ends_at, is_active, created_by)
    VALUES (v_name, v_code, p_discount_type, p_discount_value, p_applies_to, v_vendor, v_bearer,
            p_max_distance_km, v_vehicles, p_starts_at, p_ends_at, COALESCE(p_is_active, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(p) INTO v_old FROM public.promotions p WHERE id = p_id;
    IF v_old IS NULL THEN
      RAISE EXCEPTION 'Promotion not found';
    END IF;
    UPDATE public.promotions
    SET name = v_name, code = v_code, discount_type = p_discount_type, discount_value = p_discount_value,
        applies_to = p_applies_to, vendor_id = v_vendor, cost_bearer = v_bearer, max_distance_km = p_max_distance_km,
        vehicle_types = v_vehicles, starts_at = p_starts_at, ends_at = p_ends_at, is_active = COALESCE(p_is_active, true)
    WHERE id = p_id;
  END IF;

  PERFORM public.log_admin_action(CASE WHEN p_id IS NULL THEN 'create_promotion' ELSE 'update_promotion' END,
    'promotion', v_id::text, v_old, (SELECT to_jsonb(p) FROM public.promotions p WHERE id = v_id));
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_save_promotion(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID, TEXT, NUMERIC, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_promotion(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID, TEXT, NUMERIC, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;

-- Promotions with how much they've been used
CREATE OR REPLACE FUNCTION public.admin_promotions()
RETURNS TABLE (
  id UUID, name TEXT, code TEXT, discount_type TEXT, discount_value NUMERIC, applies_to TEXT, vendor_id UUID,
  vendor_name TEXT, cost_bearer TEXT, max_distance_km NUMERIC, vehicle_types TEXT[], starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ, is_active BOOLEAN, created_at TIMESTAMPTZ, state TEXT, uses BIGINT, total_discount NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN QUERY
  SELECT p.id, p.name, p.code, p.discount_type, p.discount_value, p.applies_to, p.vendor_id, v.name, p.cost_bearer,
         p.max_distance_km, p.vehicle_types, p.starts_at, p.ends_at, p.is_active, p.created_at,
         CASE WHEN NOT p.is_active THEN 'off' WHEN now() < p.starts_at THEN 'scheduled'
              WHEN now() >= p.ends_at THEN 'ended' ELSE 'running' END,
         (SELECT count(*) FROM public.orders o WHERE o.promotion_id = p.id AND o.payment_status IN ('paid', 'refunded')),
         (SELECT COALESCE(sum(o.discount_amount), 0) FROM public.orders o WHERE o.promotion_id = p.id AND o.payment_status = 'paid')
  FROM public.promotions p
  LEFT JOIN public.profiles v ON v.id = p.vendor_id
  ORDER BY p.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_promotions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_promotions() TO authenticated;

-- The promotion an order gets, and how much it takes off
CREATE OR REPLACE FUNCTION public.apply_promotion(
  p_order_type TEXT,
  p_vendor_id UUID,
  p_subtotal NUMERIC,
  p_delivery_fee NUMERIC,
  p_service_charge NUMERIC,
  p_distance_km NUMERIC,
  p_vehicle_type TEXT,
  p_coupon_code TEXT,
  OUT promotion_id UUID,
  OUT promotion_name TEXT,
  OUT discount_amount NUMERIC,
  OUT discount_target TEXT,
  OUT discount_bearer TEXT,
  OUT coupon_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := NULLIF(upper(regexp_replace(COALESCE(p_coupon_code, ''), '\s', '', 'g')), '');
  r RECORD;
BEGIN
  discount_amount := 0;
  coupon_status := CASE WHEN v_code IS NULL THEN 'none' ELSE 'invalid' END;
  IF p_order_type NOT IN ('customer', 'express') THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT s.* FROM (
      SELECT p.id, p.name, p.code, p.applies_to, p.cost_bearer, p.created_at,
             round(CASE WHEN p.discount_type = 'percent' THEN x.base * p.discount_value / 100
                        ELSE LEAST(p.discount_value, x.base) END, 2) AS amount
      FROM public.promotions p
      CROSS JOIN LATERAL (
        SELECT COALESCE(CASE p.applies_to WHEN 'service_charge' THEN p_service_charge
                                          WHEN 'delivery_fee' THEN p_delivery_fee
                                          ELSE p_subtotal END, 0) AS base
      ) x
      WHERE p.is_active
        AND now() >= p.starts_at AND now() < p.ends_at
        AND (p.code IS NULL OR p.code = v_code)
        AND (p.applies_to <> 'items' OR (p_order_type = 'customer' AND p.vendor_id = p_vendor_id))
        AND (p.max_distance_km IS NULL OR COALESCE(p_distance_km, 0) <= p.max_distance_km)
        AND (p.vehicle_types IS NULL OR p_vehicle_type = ANY (p.vehicle_types))
        AND x.base > 0
    ) s
    -- The coupon they entered first, then whichever saves the most
    ORDER BY (s.code IS NOT NULL) DESC, s.amount DESC, s.created_at
    LIMIT 1
  LOOP
    promotion_id := r.id;
    promotion_name := r.name;
    discount_amount := r.amount;
    discount_target := r.applies_to;
    discount_bearer := r.cost_bearer;
    IF r.code IS NOT NULL THEN
      coupon_status := 'applied';
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_promotion(TEXT, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- How a paid order's money is split. An items discount the business pays for
-- comes off its share (and the commission is charged on what's left); any
-- other discount is Cydex's cost. Riders get their share of the full fee.
CREATE OR REPLACE FUNCTION public.calculate_settlement_amounts(
    p_order_id UUID,
    OUT vendor_amount DECIMAL(12,2),
    OUT rider_amount DECIMAL(12,2),
    OUT platform_fee DECIMAL(12,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_subtotal DECIMAL(12,2);
    v_delivery_fee DECIMAL(12,2);
    v_vendor_discount DECIMAL(12,2);
    v_config public.pricing_config%ROWTYPE;
BEGIN
    SELECT COALESCE(subtotal, 0), COALESCE(delivery_fee, 0),
           CASE WHEN discount_target = 'items' AND discount_bearer = 'vendor' THEN COALESCE(discount_amount, 0) ELSE 0 END
    INTO v_subtotal, v_delivery_fee, v_vendor_discount
    FROM public.orders
    WHERE id = p_order_id;

    SELECT * INTO v_config FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;

    platform_fee := round((v_subtotal - v_vendor_discount) * COALESCE(v_config.vendor_commission_rate, 0.10), 2);
    vendor_amount := v_subtotal - v_vendor_discount - platform_fee;
    rider_amount := round(v_delivery_fee * COALESCE(v_config.rider_share_rate, 0.85), 2);
END;
$$;

-- Money split of every delivered order. promo_discount is what the payer
-- saved; promo_cost is the part Cydex paid for (cydex_total is after it).
-- amount_paid = vendor_got + rider_got + cydex_total always holds.
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
    + COALESCE(o.delivery_fee, 0) - COALESCE(h.rider_amount, 0)
    - CASE WHEN o.discount_bearer = 'vendor' THEN 0 ELSE COALESCE(o.discount_amount, 0) END AS cydex_total,
  COALESCE(o.discount_amount, 0) AS promo_discount,
  CASE WHEN o.discount_bearer = 'vendor' THEN 0 ELSE COALESCE(o.discount_amount, 0) END AS promo_cost
FROM public.orders o
LEFT JOIN public.payment_holds h ON h.order_id = o.id
WHERE o.status = 'delivered';

REVOKE ALL ON public.order_money_split FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.admin_earnings(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.admin_earnings(
  p_from TIMESTAMPTZ DEFAULT NULL, p_to TIMESTAMPTZ DEFAULT NULL, p_order_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  order_id UUID, order_number TEXT, order_type TEXT, delivered_at TIMESTAMPTZ, paid_by TEXT, payer_name TEXT,
  vendor_name TEXT, rider_name TEXT,
  amount_paid NUMERIC, vendor_got NUMERIC, rider_got NUMERIC,
  cydex_from_customer NUMERIC, cydex_from_vendor NUMERIC, cydex_from_rider NUMERIC, promo_cost NUMERIC, cydex_total NUMERIC,
  total_count BIGINT,
  sum_amount_paid NUMERIC, sum_vendor_got NUMERIC, sum_rider_got NUMERIC,
  sum_cydex_from_customer NUMERIC, sum_cydex_from_vendor NUMERIC, sum_cydex_from_rider NUMERIC,
  sum_promo_cost NUMERIC, sum_cydex_total NUMERIC
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
         m.amount_paid, m.vendor_got, m.rider_got, m.cydex_from_customer, m.cydex_from_vendor, m.cydex_from_rider,
         m.promo_cost, m.cydex_total,
         count(*) OVER (),
         sum(m.amount_paid) OVER (), sum(m.vendor_got) OVER (), sum(m.rider_got) OVER (),
         sum(m.cydex_from_customer) OVER (), sum(m.cydex_from_vendor) OVER (), sum(m.cydex_from_rider) OVER (),
         sum(m.promo_cost) OVER (), sum(m.cydex_total) OVER ()
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

-- The Overview's revenue now shows what promotions cost Cydex (the total is
-- already after it). Same function as before plus promo_cost.
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'promo_cost', (SELECT COALESCE(sum(promo_cost), 0) FROM delivered),
      'from_withdrawals', (SELECT COALESCE(sum(fee), 0) FROM payout_fees),
      'withdrawals_paid', (SELECT count(*) FROM payout_fees),
      'total', (SELECT COALESCE(sum(cydex_total), 0) FROM delivered) + (SELECT COALESCE(sum(fee), 0) FROM payout_fees),
      'paid_to_vendors', (SELECT COALESCE(sum(vendor_got), 0) FROM delivered),
      'paid_to_riders', (SELECT COALESCE(sum(rider_got), 0) FROM delivered)
    ),
    -- right now (not tied to the period)
    'orders_today', (SELECT count(*) FROM public.orders o LEFT JOIN public.payment_holds h ON h.order_id = o.id
                     WHERE o.payment_status IN ('paid', 'refunded') AND COALESCE(h.created_at, o.created_at) >= date_trunc('day', now())),
    'active_deliveries', (SELECT count(*) FROM public.orders WHERE status IN ('rider_assigned', 'picking_up', 'out_for_delivery', 'arrived')),
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
$function$;
