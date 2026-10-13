-- Promotions: who they're for, and how many times they can be used
--
--   * audience: customers, vendors, riders or everyone
--       customers  -> discount on what they pay (Service Charge, delivery fee, a business's items)
--       vendors    -> discount on Request Rider (delivery fee or its commission), or on the
--                     commission Cydex takes from their sales
--       riders     -> discount on the commission Cydex takes from the delivery fee
--   * max_users: only the first N different people to use it get it
--   * max_uses_per_user: each person can use it N times
--
-- A "use" is an order that hasn't been cancelled or rejected and is paid (or
-- was placed in the last 30 minutes and may still be paid). Cancelling or
-- refunding an order gives the use back.

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'customer' CHECK (audience IN ('customer', 'vendor', 'rider', 'all')),
  ADD COLUMN IF NOT EXISTS max_users INTEGER CHECK (max_users IS NULL OR max_users > 0),
  ADD COLUMN IF NOT EXISTS max_uses_per_user INTEGER CHECK (max_uses_per_user IS NULL OR max_uses_per_user > 0);

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_applies_to_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_applies_to_check
  CHECK (applies_to IN ('service_charge', 'delivery_fee', 'items', 'commission'));
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_audience_applies_to;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_audience_applies_to CHECK (
     (audience = 'customer' AND applies_to IN ('service_charge', 'delivery_fee', 'items'))
  OR (audience = 'vendor' AND applies_to IN ('service_charge', 'delivery_fee', 'commission'))
  OR (audience = 'rider' AND applies_to = 'commission')
  OR (audience = 'all' AND applies_to IN ('service_charge', 'delivery_fee', 'commission'))
);
-- Commission promotions apply by themselves: there's nowhere to type a code
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_commission_no_code;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_commission_no_code CHECK (applies_to <> 'commission' OR code IS NULL);

-- A commission promotion on an order: the vendor's is fixed when the order is
-- placed, the rider's when a rider takes it
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vendor_promotion_id UUID REFERENCES public.promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_commission_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_promotion_id UUID REFERENCES public.promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rider_commission_discount NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS orders_promotion_id_idx ON public.orders (promotion_id) WHERE promotion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_vendor_promotion_id_idx ON public.orders (vendor_promotion_id) WHERE vendor_promotion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_rider_promotion_id_idx ON public.orders (rider_promotion_id) WHERE rider_promotion_id IS NOT NULL;

-- Who has used a promotion, and how many times
CREATE OR REPLACE FUNCTION public.promotion_uses(p_promotion_id UUID)
RETURNS TABLE (user_id UUID, uses BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.user_id, count(*)
  FROM (
    SELECT CASE WHEN o.order_type = 'rider_request' THEN o.vendor_id ELSE o.customer_id END AS user_id
    FROM public.orders o WHERE o.promotion_id = p_promotion_id AND o.status NOT IN ('cancelled', 'rejected') AND (o.payment_status = 'paid' OR (o.payment_status = 'pending' AND o.created_at > now() - interval '30 minutes'))
    UNION ALL
    SELECT o.vendor_id FROM public.orders o WHERE o.vendor_promotion_id = p_promotion_id AND o.status NOT IN ('cancelled', 'rejected') AND (o.payment_status = 'paid' OR (o.payment_status = 'pending' AND o.created_at > now() - interval '30 minutes'))
    UNION ALL
    SELECT o.rider_id FROM public.orders o WHERE o.rider_promotion_id = p_promotion_id AND o.status NOT IN ('cancelled', 'rejected') AND (o.payment_status = 'paid' OR (o.payment_status = 'pending' AND o.created_at > now() - interval '30 minutes'))
  ) u
  WHERE u.user_id IS NOT NULL
  GROUP BY 1;
$$;
REVOKE EXECUTE ON FUNCTION public.promotion_uses(UUID) FROM PUBLIC, anon, authenticated;

-- Is there room for this person to use the promotion (again)?
--   reason: 'used_up' (their own limit) or 'fully_claimed' (the first N people have it)
--   uses_left: how many more times they can use it (NULL = no limit)
CREATE OR REPLACE FUNCTION public.promotion_room(
  p_promotion_id UUID,
  p_user_id UUID,
  OUT eligible BOOLEAN,
  OUT reason TEXT,
  OUT uses_left INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.promotions%ROWTYPE;
  v_mine BIGINT;
  v_users BIGINT;
BEGIN
  SELECT * INTO p FROM public.promotions WHERE id = p_promotion_id;
  eligible := p.id IS NOT NULL;
  IF NOT eligible OR (p.max_users IS NULL AND p.max_uses_per_user IS NULL) THEN
    RETURN;
  END IF;

  SELECT COALESCE(max(u.uses) FILTER (WHERE u.user_id = p_user_id), 0), count(*)
  INTO v_mine, v_users
  FROM public.promotion_uses(p.id) u;

  IF p.max_uses_per_user IS NOT NULL THEN
    uses_left := GREATEST(p.max_uses_per_user - v_mine, 0)::int;
    IF uses_left = 0 THEN
      eligible := false;
      reason := 'used_up';
      RETURN;
    END IF;
  END IF;
  -- Someone who already has it keeps it; a newcomer needs a free place
  IF p.max_users IS NOT NULL AND v_mine = 0 AND v_users >= p.max_users THEN
    eligible := false;
    reason := 'fully_claimed';
    uses_left := 0;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.promotion_room(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- While a limited promotion is running, orders are created one at a time so
-- two people can't both take the last place
CREATE OR REPLACE FUNCTION public.lock_limited_promotions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.promotions
             WHERE is_active AND now() < ends_at AND (max_users IS NOT NULL OR max_uses_per_user IS NOT NULL)) THEN
    PERFORM pg_advisory_xact_lock(20261014);
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lock_limited_promotions() FROM PUBLIC, anon, authenticated;

-- The discount on what someone pays: a customer (orders, Cydex Express) or a
-- vendor (Request Rider). One per order: the coupon they entered if it's
-- valid for them, otherwise whichever automatic promotion saves the most.
DROP FUNCTION IF EXISTS public.apply_promotion(TEXT, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.apply_promotion(
  p_order_type TEXT,
  p_user_id UUID,
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
  OUT coupon_status TEXT,
  OUT coupon_message TEXT,
  OUT uses_left INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := NULLIF(upper(regexp_replace(COALESCE(p_coupon_code, ''), '\s', '', 'g')), '');
  v_audience TEXT := CASE WHEN p_order_type = 'rider_request' THEN 'vendor' ELSE 'customer' END;
  r RECORD;
  room RECORD;
  c public.promotions%ROWTYPE;
BEGIN
  discount_amount := 0;
  coupon_status := CASE WHEN v_code IS NULL THEN 'none' ELSE 'invalid' END;
  IF p_order_type NOT IN ('customer', 'express', 'rider_request') THEN
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
                                          WHEN 'items' THEN p_subtotal END, 0) AS base
      ) x
      WHERE p.is_active
        AND now() >= p.starts_at AND now() < p.ends_at
        AND p.applies_to <> 'commission'
        AND p.audience IN (v_audience, 'all')
        AND (p.code IS NULL OR p.code = v_code)
        AND (p.applies_to <> 'items' OR (p_order_type = 'customer' AND p.vendor_id = p_vendor_id))
        AND (p.max_distance_km IS NULL OR COALESCE(p_distance_km, 0) <= p.max_distance_km)
        AND (p.vehicle_types IS NULL OR p_vehicle_type = ANY (p.vehicle_types))
        AND x.base > 0
    ) s
    -- The coupon they entered first, then whichever saves the most
    ORDER BY (s.code IS NOT NULL) DESC, s.amount DESC, s.created_at
  LOOP
    SELECT * INTO room FROM public.promotion_room(r.id, p_user_id);
    CONTINUE WHEN NOT room.eligible;
    promotion_id := r.id;
    promotion_name := r.name;
    discount_amount := r.amount;
    discount_target := r.applies_to;
    discount_bearer := r.cost_bearer;
    uses_left := room.uses_left;
    IF r.code IS NOT NULL THEN
      coupon_status := 'applied';
    END IF;
    EXIT;
  END LOOP;

  -- Why the code they typed wasn't used
  IF coupon_status = 'invalid' THEN
    SELECT * INTO c FROM public.promotions WHERE code = v_code;
    IF c.id IS NULL OR NOT c.is_active OR now() < c.starts_at THEN
      coupon_message := 'That coupon code isn''t valid.';
    ELSIF now() >= c.ends_at THEN
      coupon_message := 'That coupon has ended.';
    ELSIF c.audience NOT IN (v_audience, 'all') THEN
      coupon_message := 'That coupon isn''t for this kind of order.';
    ELSE
      SELECT * INTO room FROM public.promotion_room(c.id, p_user_id);
      coupon_message := CASE room.reason
        WHEN 'used_up' THEN 'You''ve already used this coupon as many times as it allows.'
        WHEN 'fully_claimed' THEN 'This coupon has been fully claimed.'
        ELSE 'That coupon doesn''t apply to this order.' END;
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_promotion(TEXT, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- A discount on the commission Cydex takes from a vendor's sale or a rider's
-- delivery fee. Automatic; the one that saves them the most.
CREATE OR REPLACE FUNCTION public.apply_commission_promotion(
  p_role TEXT,
  p_user_id UUID,
  p_commission NUMERIC,
  p_distance_km NUMERIC,
  p_vehicle_type TEXT,
  OUT promotion_id UUID,
  OUT discount_amount NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  room RECORD;
BEGIN
  discount_amount := 0;
  IF p_user_id IS NULL OR COALESCE(p_commission, 0) <= 0 OR p_role NOT IN ('vendor', 'rider') THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT p.id, p.created_at,
           round(CASE WHEN p.discount_type = 'percent' THEN p_commission * p.discount_value / 100
                      ELSE LEAST(p.discount_value, p_commission) END, 2) AS amount
    FROM public.promotions p
    WHERE p.is_active
      AND now() >= p.starts_at AND now() < p.ends_at
      AND p.applies_to = 'commission'
      AND p.audience IN (p_role, 'all')
      AND (p.max_distance_km IS NULL OR COALESCE(p_distance_km, 0) <= p.max_distance_km)
      AND (p.vehicle_types IS NULL OR p_vehicle_type = ANY (p.vehicle_types))
    ORDER BY 3 DESC, p.created_at
  LOOP
    CONTINUE WHEN r.amount <= 0;
    SELECT * INTO room FROM public.promotion_room(r.id, p_user_id);
    CONTINUE WHEN NOT room.eligible;
    promotion_id := r.id;
    discount_amount := r.amount;
    EXIT;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_commission_promotion(TEXT, UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;

-- How a paid order's money is split. An items discount the business pays for
-- comes off its share (and the commission is charged on what's left); a
-- commission promotion lowers the commission. Riders get their share of the
-- full fee (a rider's commission promotion is added when a rider takes it).
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
    v_commission_discount DECIMAL(12,2);
    v_rider_discount DECIMAL(12,2);
    v_config public.pricing_config%ROWTYPE;
BEGIN
    SELECT COALESCE(subtotal, 0), COALESCE(delivery_fee, 0),
           CASE WHEN discount_target = 'items' AND discount_bearer = 'vendor' THEN COALESCE(discount_amount, 0) ELSE 0 END,
           COALESCE(vendor_commission_discount, 0), COALESCE(rider_commission_discount, 0)
    INTO v_subtotal, v_delivery_fee, v_vendor_discount, v_commission_discount, v_rider_discount
    FROM public.orders
    WHERE id = p_order_id;

    SELECT * INTO v_config FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;

    platform_fee := GREATEST(round((v_subtotal - v_vendor_discount) * COALESCE(v_config.vendor_commission_rate, 0.10), 2)
                             - v_commission_discount, 0);
    vendor_amount := v_subtotal - v_vendor_discount - platform_fee;
    rider_amount := LEAST(round(v_delivery_fee * COALESCE(v_config.rider_share_rate, 0.85), 2) + v_rider_discount, v_delivery_fee);
END;
$$;

-- When a rider takes (or loses) an order: note their vehicle, and work out
-- any promotion on their commission
CREATE OR REPLACE FUNCTION public.set_rider_vehicle_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base NUMERIC;
  c RECORD;
BEGIN
  IF NEW.rider_id IS DISTINCT FROM OLD.rider_id THEN
    NEW.rider_vehicle_type := (SELECT vehicle_type FROM public.rider_profiles WHERE id = NEW.rider_id);
    NEW.rider_promotion_id := NULL;
    NEW.rider_commission_discount := 0;
    IF NEW.rider_id IS NOT NULL THEN
      -- What the rider gets without a promotion
      SELECT h.rider_amount - COALESCE(OLD.rider_commission_discount, 0) INTO v_base
      FROM public.payment_holds h WHERE h.order_id = NEW.id AND h.status = 'held';
      IF v_base IS NULL THEN
        SELECT round(COALESCE(NEW.delivery_fee, 0) * COALESCE(rider_share_rate, 0.85), 2) INTO v_base
        FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
      END IF;
      SELECT * INTO c FROM public.apply_commission_promotion(
        'rider', NEW.rider_id, GREATEST(COALESCE(NEW.delivery_fee, 0) - COALESCE(v_base, 0), 0), NEW.distance_km,
        COALESCE(NEW.rider_vehicle_type, public.default_vehicle_type()));
      NEW.rider_promotion_id := c.promotion_id;
      NEW.rider_commission_discount := COALESCE(c.discount_amount, 0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ...and carry it into what the rider is shown and paid
CREATE OR REPLACE FUNCTION public.sync_rider_commission_discount()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.rider_commission_discount IS DISTINCT FROM OLD.rider_commission_discount THEN
    UPDATE public.payment_holds
    SET rider_amount = rider_amount - COALESCE(OLD.rider_commission_discount, 0) + NEW.rider_commission_discount
    WHERE order_id = NEW.id AND status = 'held';
    UPDATE public.deliveries
    SET rider_earning = COALESCE(rider_earning, 0) - COALESCE(OLD.rider_commission_discount, 0) + NEW.rider_commission_discount
    WHERE order_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS sync_rider_commission_discount ON public.orders;
CREATE TRIGGER sync_rider_commission_discount
  AFTER UPDATE OF rider_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_rider_commission_discount();

-- Customer orders: the coupon's own message, and any promotion on the vendor's commission
CREATE OR REPLACE FUNCTION public.price_new_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price RECORD;
  d RECORD;
  c RECORD;
  v_rate NUMERIC;
BEGIN
  -- Only the database sets these
  NEW.vendor_promotion_id := NULL;
  NEW.vendor_commission_discount := 0;
  NEW.rider_promotion_id := NULL;
  NEW.rider_commission_discount := 0;
  IF NEW.order_type IN ('rider_request', 'express') THEN
    RETURN NEW;
  END IF;

  IF NOT public.vendor_is_open(NEW.vendor_id) THEN
    RAISE EXCEPTION 'This vendor is closed right now. Check their opening hours and try again.';
  END IF;

  IF NEW.delivery_type = 'pickup' THEN
    -- Customer collects from the store: no delivery fee
    SELECT * INTO v_price FROM public.calculate_order_price(NEW.vendor_id, NULL, NEW.subtotal);
    NEW.distance_km := NULL;
    NEW.base_rate := NULL;
    NEW.distance_fee := NULL;
    NEW.delivery_fee := 0;
    NEW.preferred_vehicle_type := NULL;
    NEW.service_charge := v_price.service_charge;
    NEW.total_amount := COALESCE(NEW.subtotal, 0) + v_price.service_charge;
    RETURN NEW;
  END IF;

  IF NEW.delivery_address_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = NEW.delivery_address_id AND profile_id = NEW.customer_id) THEN
    RAISE EXCEPTION 'Choose one of your saved delivery addresses';
  END IF;

  SELECT * INTO v_price FROM public.calculate_order_price(NEW.vendor_id, NEW.delivery_address_id, NEW.subtotal, NEW.preferred_vehicle_type);

  IF v_price.status = 'no_store' THEN
    RAISE EXCEPTION 'This vendor has not set a store location yet, so it can''t take delivery orders';
  ELSIF v_price.status = 'out_of_range' THEN
    RAISE EXCEPTION 'This vendor is too far from your delivery address. The longest delivery we do is %.', public.km_text(public.max_trip_km());
  END IF;

  NEW.distance_km := v_price.distance_km;
  NEW.preferred_vehicle_type := v_price.vehicle_type;
  NEW.vehicle_rate_per_km := v_price.rate_per_km;
  NEW.base_rate := v_price.base_rate;
  NEW.distance_fee := v_price.distance_fee;
  NEW.delivery_fee := v_price.delivery_fee;
  NEW.service_charge := v_price.service_charge;

  SELECT * INTO d FROM public.apply_promotion('customer', NEW.customer_id, NEW.vendor_id, NEW.subtotal, v_price.delivery_fee,
                                              v_price.service_charge, v_price.distance_km, v_price.vehicle_type, NEW.coupon_code);
  IF d.coupon_status = 'invalid' THEN
    RAISE EXCEPTION '%', d.coupon_message;
  END IF;
  NEW.promotion_id := d.promotion_id;
  NEW.discount_amount := COALESCE(d.discount_amount, 0);
  NEW.discount_target := d.discount_target;
  NEW.discount_bearer := d.discount_bearer;
  NEW.coupon_code := CASE WHEN d.coupon_status = 'applied' THEN upper(trim(NEW.coupon_code)) END;
  NEW.total_amount := GREATEST(v_price.total_amount - NEW.discount_amount, 0);

  SELECT COALESCE(vendor_commission_rate, 0.10) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO c FROM public.apply_commission_promotion(
    'vendor', NEW.vendor_id,
    round((COALESCE(NEW.subtotal, 0) - CASE WHEN NEW.discount_target = 'items' AND NEW.discount_bearer = 'vendor'
                                            THEN NEW.discount_amount ELSE 0 END) * COALESCE(v_rate, 0.10), 2),
    v_price.distance_km, v_price.vehicle_type);
  NEW.vendor_promotion_id := c.promotion_id;
  NEW.vendor_commission_discount := COALESCE(c.discount_amount, 0);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_order_prices()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    OR NEW.preferred_vehicle_type IS DISTINCT FROM OLD.preferred_vehicle_type
    OR NEW.vehicle_rate_per_km IS DISTINCT FROM OLD.vehicle_rate_per_km
    OR NEW.mode_widened_at IS DISTINCT FROM OLD.mode_widened_at
    OR NEW.rider_vehicle_type IS DISTINCT FROM OLD.rider_vehicle_type
    OR NEW.pickup_address IS DISTINCT FROM OLD.pickup_address
    OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
    OR NEW.batch_seq IS DISTINCT FROM OLD.batch_seq
    OR NEW.promotion_id IS DISTINCT FROM OLD.promotion_id
    OR NEW.coupon_code IS DISTINCT FROM OLD.coupon_code
    OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
    OR NEW.discount_target IS DISTINCT FROM OLD.discount_target
    OR NEW.discount_bearer IS DISTINCT FROM OLD.discount_bearer
    OR NEW.arrived_at IS DISTINCT FROM OLD.arrived_at
    OR NEW.vendor_promotion_id IS DISTINCT FROM OLD.vendor_promotion_id
    OR NEW.vendor_commission_discount IS DISTINCT FROM OLD.vendor_commission_discount
    OR NEW.rider_promotion_id IS DISTINCT FROM OLD.rider_promotion_id
    OR NEW.rider_commission_discount IS DISTINCT FROM OLD.rider_commission_discount
  ) THEN
    RAISE EXCEPTION 'Order prices and delivery details can''t be changed after the order is placed';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.place_order(p_vendor_id uuid, p_address_id uuid, p_items jsonb, p_special_instructions text DEFAULT NULL::text, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer UUID := auth.uid();
  v_subtotal NUMERIC;
  v_address public.addresses%ROWTYPE;
  v_phone TEXT;
  v_order public.orders%ROWTYPE;
  v_store JSONB := public.order_pickup_point(p_vendor_id, NULL);
  v_modes JSONB;
  v_mode TEXT;
  v_paid NUMERIC;
BEGIN
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'Log in to place an order';
  END IF;

  PERFORM public.lock_limited_promotions();
  v_subtotal := public.cart_subtotal(p_vendor_id, p_items);

  SELECT * INTO v_address FROM public.addresses WHERE id = p_address_id AND profile_id = v_customer;
  IF v_address.id IS NULL THEN
    RAISE EXCEPTION 'Choose one of your saved delivery addresses';
  END IF;
  SELECT phone INTO v_phone FROM public.profiles WHERE id = v_customer;

  -- Someone has to be free to deliver it
  v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
    COALESCE((SELECT distance_km FROM public.calculate_order_price(p_vendor_id, p_address_id, 0, NULL)), 0), 0);
  IF jsonb_array_length(v_modes) > 0
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'in_range')::boolean) THEN
    RAISE EXCEPTION 'This vendor is too far from your delivery address. The longest delivery we do is %.', public.km_text(public.max_trip_km());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'Our service is currently unavailable because all our riders are busy at the moment. Please check again later.';
  END IF;
  v_mode := COALESCE(NULLIF(trim(p_vehicle_type), ''), public.default_vehicle_type());
  IF p_vehicle_type IS NOT NULL
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = v_mode AND NOT (m ->> 'in_range')::boolean) THEN
    RAISE EXCEPTION 'That delivery mode doesn''t go this far. Choose another delivery mode.';
  END IF;
  IF p_vehicle_type IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = v_mode AND (m ->> 'available')::boolean) THEN
    RAISE EXCEPTION 'No rider with that delivery mode is free right now. Choose another delivery mode.';
  END IF;
  v_mode := public.pick_delivery_mode(v_modes, v_mode);

  INSERT INTO public.orders (
    customer_id, vendor_id, status, payment_status, delivery_type,
    delivery_address, delivery_address_id, subtotal, total_amount, special_instructions,
    preferred_vehicle_type, coupon_code
  ) VALUES (
    v_customer, p_vendor_id, 'pending', 'pending', 'standard',
    public.address_snapshot(v_address) || jsonb_build_object('phone', COALESCE(v_phone, '')),
    v_address.id, v_subtotal, v_subtotal, p_special_instructions,
    v_mode, NULLIF(trim(p_coupon_code), '')
  )
  RETURNING * INTO v_order;

  INSERT INTO public.order_items (
    order_id, product_id, product_name, product_description, product_category,
    quantity, unit_price, total_price, is_eco_friendly, carbon_impact
  )
  SELECT v_order.id, p.id, p.name, p.description, p.category,
         (i.value ->> 'quantity')::integer, p.price, p.price * (i.value ->> 'quantity')::integer,
         p.is_eco_friendly, p.carbon_impact
  FROM jsonb_array_elements(p_items) i
  JOIN public.products p ON p.id = (i.value ->> 'product_id')::uuid;

  -- Wallet first; Squad takes the rest (squad-checkout charges total - wallet_amount)
  v_paid := public.pay_order_from_customer_wallet(v_order.id);
  IF v_paid >= v_order.total_amount THEN
    PERFORM set_config('cydex.order_flow', 'on', true);
    UPDATE public.orders
    SET payment_status = 'paid', payment_reference = 'WALLET-' || v_order.order_number, payment_gateway = 'wallet',
        payment_method = 'wallet'
    WHERE id = v_order.id;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  RETURN v_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.checkout_quote(p_vendor_id uuid, p_address_id uuid, p_items jsonb, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_subtotal NUMERIC := public.cart_subtotal(p_vendor_id, p_items);
  v_address UUID := (SELECT a.id FROM public.addresses a WHERE a.id = p_address_id AND a.profile_id = auth.uid());
  v_store JSONB := public.order_pickup_point(p_vendor_id, NULL);
  v_prep INTEGER;
  v_modes JSONB := '[]'::jsonb;
  v_mode TEXT;
  p RECORD;
  d RECORD;
  v_wallet NUMERIC;
  v_total NUMERIC;
BEGIN
  SELECT COALESCE((SELECT prep_time_minutes FROM public.vendor_hours WHERE vendor_id = p_vendor_id), 15) INTO v_prep;
  SELECT * INTO p FROM public.calculate_order_price(p_vendor_id, v_address, v_subtotal, p_vehicle_type);

  IF p.status IN ('ok', 'out_of_range') THEN
    v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, p.distance_km, v_prep);
    -- Price for the mode they'll actually get (their choice if it's available)
    v_mode := COALESCE(public.pick_delivery_mode(v_modes, COALESCE(p_vehicle_type, public.default_vehicle_type())), p.vehicle_type);
    SELECT * INTO p FROM public.calculate_order_price(p_vendor_id, v_address, v_subtotal, v_mode);
  END IF;

  SELECT * INTO d FROM public.apply_promotion('customer', auth.uid(), p_vendor_id, v_subtotal, p.delivery_fee, p.service_charge,
                                              p.distance_km, p.vehicle_type, p_coupon_code);
  v_total := GREATEST(COALESCE(p.total_amount, v_subtotal + p.service_charge) - COALESCE(d.discount_amount, 0), 0);
  SELECT COALESCE(available_balance, 0) INTO v_wallet FROM public.customer_wallet WHERE customer_id = auth.uid();
  v_wallet := COALESCE(v_wallet, 0);

  RETURN jsonb_build_object(
    'status', p.status,
    'subtotal', v_subtotal,
    'distance_km', p.distance_km,
    'vehicle_type', p.vehicle_type,
    'rate_per_km', p.rate_per_km,
    'base_rate', p.base_rate,
    'distance_fee', p.distance_fee,
    'delivery_fee', p.delivery_fee,
    'service_charge', p.service_charge,
    'discount_amount', COALESCE(d.discount_amount, 0),
    'discount_target', d.discount_target,
    'promotion_name', d.promotion_name,
    'coupon_status', d.coupon_status,
    'coupon_message', d.coupon_message,
    'promotion_uses_left', d.uses_left,
    'total_amount', v_total,
    'wallet_balance', v_wallet,
    'wallet_amount', LEAST(v_wallet, v_total),
    'card_amount', v_total - LEAST(v_wallet, v_total),
    'vendor_open', public.vendor_is_open(p_vendor_id),
    'prep_time_minutes', v_prep,
    'riders_available', EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean),
    'modes', v_modes,
    'eta_min', (SELECT (m ->> 'eta_min')::int FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = p.vehicle_type),
    'eta_max', (SELECT (m ->> 'eta_max')::int FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = p.vehicle_type)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.express_quote(p_pickup jsonb, p_dropoff jsonb, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rate NUMERIC;
  v_wallet NUMERIC;
  v_modes JSONB := '[]'::jsonb;
  v_plat DOUBLE PRECISION := (p_pickup ->> 'latitude')::float8;
  v_plng DOUBLE PRECISION := (p_pickup ->> 'longitude')::float8;
  q RECORD;
  d RECORD;
  v_total NUMERIC;
BEGIN
  SELECT COALESCE(service_charge_rate, 0.15) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  SELECT COALESCE(available_balance, 0) INTO v_wallet FROM public.customer_wallet WHERE customer_id = auth.uid();
  v_wallet := COALESCE(v_wallet, 0);

  SELECT * INTO q FROM public.delivery_leg_quote(v_plat, v_plng, (p_dropoff ->> 'latitude')::float8,
                                                 (p_dropoff ->> 'longitude')::float8, p_vehicle_type, v_rate);
  IF q.status = 'no_location' THEN
    RETURN jsonb_build_object('status', 'no_location', 'wallet_balance', v_wallet);
  END IF;
  v_modes := public.delivery_modes(v_plat, v_plng, q.distance_km, 0);
  SELECT * INTO q FROM public.delivery_leg_quote(
    v_plat, v_plng, (p_dropoff ->> 'latitude')::float8, (p_dropoff ->> 'longitude')::float8,
    COALESCE(public.pick_delivery_mode(v_modes, COALESCE(p_vehicle_type, public.default_vehicle_type())), q.vehicle_type), v_rate);

  SELECT * INTO d FROM public.apply_promotion('express', auth.uid(), NULL, 0, q.delivery_fee, q.charge, q.distance_km, q.vehicle_type, p_coupon_code);
  v_total := GREATEST(q.total_amount - COALESCE(d.discount_amount, 0), 0);

  RETURN jsonb_build_object(
    'status', q.status,
    'distance_km', q.distance_km,
    'vehicle_type', q.vehicle_type,
    'rate_per_km', q.rate_per_km,
    'base_rate', q.base_rate,
    'distance_fee', q.distance_fee,
    'delivery_fee', q.delivery_fee,
    'service_charge', q.charge,
    'discount_amount', COALESCE(d.discount_amount, 0),
    'discount_target', d.discount_target,
    'promotion_name', d.promotion_name,
    'coupon_status', d.coupon_status,
    'coupon_message', d.coupon_message,
    'promotion_uses_left', d.uses_left,
    'total_amount', v_total,
    'wallet_balance', v_wallet,
    'wallet_amount', LEAST(v_wallet, v_total),
    'card_amount', v_total - LEAST(v_wallet, v_total),
    'riders_available', EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean),
    'modes', v_modes,
    'eta_min', (SELECT (m ->> 'eta_min')::int FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = q.vehicle_type)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_express_order(p_pickup jsonb, p_dropoff jsonb, p_recipient_name text, p_recipient_phone text, p_recipient_email text, p_package_details text, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer UUID := auth.uid();
  v_me public.profiles%ROWTYPE;
  v_plat DOUBLE PRECISION := (p_pickup ->> 'latitude')::float8;
  v_plng DOUBLE PRECISION := (p_pickup ->> 'longitude')::float8;
  v_rate NUMERIC;
  v_mode TEXT;
  q RECORD;
  d RECORD;
  v_total NUMERIC;
  v_paid NUMERIC;
  v_order public.orders%ROWTYPE;
BEGIN
  PERFORM public.lock_limited_promotions();
  SELECT * INTO v_me FROM public.profiles WHERE id = v_customer;
  IF v_me.id IS NULL OR lower(v_me.role) <> 'customer' THEN
    RAISE EXCEPTION 'Log in as a customer to use Cydex Express';
  END IF;
  IF NOT public.is_valid_phone(v_me.phone) THEN
    RAISE EXCEPTION 'Add a phone number to your profile first, so the rider can reach you at pickup';
  END IF;
  IF v_plat IS NULL OR v_plng IS NULL OR NULLIF(p_pickup ->> 'formatted_address', '') IS NULL THEN
    RAISE EXCEPTION 'Choose the pickup location on the map';
  END IF;
  PERFORM public.check_recipient(p_recipient_name, p_recipient_phone, p_recipient_email, p_dropoff);
  IF NULLIF(trim(p_package_details), '') IS NULL THEN
    RAISE EXCEPTION 'Describe what you''re sending';
  END IF;

  SELECT COALESCE(service_charge_rate, 0.15) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  v_mode := public.require_free_rider(public.delivery_modes(v_plat, v_plng,
    public.longest_leg_km(v_plat, v_plng, jsonb_build_array(p_dropoff)), 0), p_vehicle_type);
  SELECT * INTO q FROM public.delivery_leg_quote(v_plat, v_plng, (p_dropoff ->> 'latitude')::float8,
                                                 (p_dropoff ->> 'longitude')::float8, v_mode, v_rate);
  IF q.status = 'out_of_range' THEN
    RAISE EXCEPTION 'The drop-off is too far from the pickup point. The longest delivery we do is %.', public.km_text(public.max_trip_km());
  END IF;

  SELECT * INTO d FROM public.apply_promotion('express', v_customer, NULL, 0, q.delivery_fee, q.charge, q.distance_km, q.vehicle_type, p_coupon_code);
  IF d.coupon_status = 'invalid' THEN
    RAISE EXCEPTION '%', d.coupon_message;
  END IF;
  v_total := GREATEST(q.total_amount - COALESCE(d.discount_amount, 0), 0);

  INSERT INTO public.orders (
    order_type, customer_id, vendor_id, status, payment_status, delivery_type,
    pickup_address, delivery_address, subtotal, delivery_fee, service_charge, total_amount,
    distance_km, base_rate, distance_fee, special_instructions, preferred_vehicle_type, vehicle_rate_per_km,
    promotion_id, coupon_code, discount_amount, discount_target, discount_bearer
  ) VALUES (
    'express', v_customer, NULL, 'pending', 'pending', 'standard',
    public.delivery_point(p_pickup, v_me.name, v_me.phone),
    public.delivery_point(p_dropoff, p_recipient_name, p_recipient_phone, p_recipient_email),
    0, q.delivery_fee, q.charge, v_total,
    q.distance_km, q.base_rate, q.distance_fee, trim(p_package_details), q.vehicle_type, q.rate_per_km,
    d.promotion_id, CASE WHEN d.coupon_status = 'applied' THEN upper(trim(p_coupon_code)) END,
    COALESCE(d.discount_amount, 0), d.discount_target, d.discount_bearer
  )
  RETURNING * INTO v_order;

  v_paid := public.pay_order_from_customer_wallet(v_order.id);
  IF v_paid >= v_order.total_amount THEN
    PERFORM public.activate_rider_request(v_order.id, 'WALLET-' || v_order.order_number, 'wallet', '{}');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  RETURN v_order;
END;
$function$;

DROP FUNCTION IF EXISTS public.rider_request_quote(DOUBLE PRECISION, DOUBLE PRECISION, TEXT);
CREATE OR REPLACE FUNCTION public.rider_request_quote(p_latitude double precision, p_longitude double precision, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store JSONB := public.order_pickup_point(auth.uid(), NULL);
  v_rate NUMERIC;
  v_wallet NUMERIC;
  v_modes JSONB := '[]'::jsonb;
  q RECORD;
  d RECORD;
  v_total NUMERIC;
BEGIN
  SELECT COALESCE(rider_request_commission_rate, 0.10) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  SELECT COALESCE(available_balance, 0) INTO v_wallet FROM public.vendor_wallet WHERE vendor_id = auth.uid();
  v_wallet := COALESCE(v_wallet, 0);
  IF v_store IS NULL THEN
    RETURN jsonb_build_object('status', 'no_store', 'wallet_balance', v_wallet);
  END IF;

  SELECT * INTO q FROM public.delivery_leg_quote((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
                                                 p_latitude, p_longitude, p_vehicle_type, v_rate);
  IF q.status = 'no_location' THEN
    RETURN jsonb_build_object('status', 'no_location', 'wallet_balance', v_wallet);
  END IF;
  v_modes := public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, q.distance_km, 0);
  -- Price for the mode they'll get (their choice if a rider with it is free)
  SELECT * INTO q FROM public.delivery_leg_quote(
    (v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, p_latitude, p_longitude,
    COALESCE(public.pick_delivery_mode(v_modes, COALESCE(p_vehicle_type, public.default_vehicle_type())), q.vehicle_type), v_rate);

  SELECT * INTO d FROM public.apply_promotion('rider_request', auth.uid(), auth.uid(), 0, q.delivery_fee, q.charge,
                                              q.distance_km, q.vehicle_type, p_coupon_code);
  v_total := GREATEST(q.total_amount - COALESCE(d.discount_amount, 0), 0);

  RETURN jsonb_build_object(
    'status', q.status,
    'distance_km', q.distance_km,
    'vehicle_type', q.vehicle_type,
    'rate_per_km', q.rate_per_km,
    'base_rate', q.base_rate,
    'distance_fee', q.distance_fee,
    'delivery_fee', q.delivery_fee,
    'commission', q.charge,
    'discount_amount', COALESCE(d.discount_amount, 0),
    'discount_target', d.discount_target,
    'promotion_name', d.promotion_name,
    'coupon_status', d.coupon_status,
    'coupon_message', d.coupon_message,
    'promotion_uses_left', d.uses_left,
    'total_amount', v_total,
    'wallet_balance', v_wallet,
    'wallet_amount', LEAST(v_wallet, v_total),
    'card_amount', v_total - LEAST(v_wallet, v_total),
    'riders_available', EXISTS (SELECT 1 FROM jsonb_array_elements(v_modes) m WHERE (m ->> 'available')::boolean),
    'modes', v_modes,
    'eta_min', (SELECT (m ->> 'eta_min')::int FROM jsonb_array_elements(v_modes) m WHERE m ->> 'key' = q.vehicle_type)
  );
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.rider_request_quote(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_request_quote(DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.create_rider_request(TEXT, TEXT, TEXT, JSONB, TEXT, BOOLEAN, TEXT);
CREATE OR REPLACE FUNCTION public.create_rider_request(p_recipient_name text, p_recipient_phone text, p_recipient_email text, p_location jsonb, p_package_details text DEFAULT NULL::text, p_save_customer boolean DEFAULT false, p_vehicle_type text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vendor UUID := auth.uid();
  v_lat DOUBLE PRECISION := (p_location ->> 'latitude')::double precision;
  v_lng DOUBLE PRECISION := (p_location ->> 'longitude')::double precision;
  v_store JSONB := public.order_pickup_point(auth.uid(), NULL);
  v_rate NUMERIC;
  v_mode TEXT;
  q RECORD;
  d RECORD;
  v_total NUMERIC;
  v_wallet NUMERIC;
  v_order public.orders%ROWTYPE;
BEGIN
  PERFORM public.lock_limited_promotions();
  IF public.current_user_role() IS DISTINCT FROM 'vendor' THEN
    RAISE EXCEPTION 'Only vendors can request a rider';
  END IF;
  IF NOT public.vendor_can_trade(v_vendor) THEN
    RAISE EXCEPTION 'Your store isn''t active yet. Finish onboarding or wait for verification.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_vendor AND public.is_valid_phone(phone)) THEN
    RAISE EXCEPTION 'Add a phone number to your profile before requesting a rider';
  END IF;
  PERFORM public.check_recipient(p_recipient_name, p_recipient_phone, p_recipient_email, p_location);
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'Set your store location in Settings before requesting a rider';
  END IF;

  SELECT COALESCE(rider_request_commission_rate, 0.10) INTO v_rate FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  v_mode := public.require_free_rider(
    public.delivery_modes((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
      public.longest_leg_km((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8, jsonb_build_array(p_location)), 0),
    p_vehicle_type);
  SELECT * INTO q FROM public.delivery_leg_quote((v_store ->> 'latitude')::float8, (v_store ->> 'longitude')::float8,
                                                 v_lat, v_lng, v_mode, v_rate);
  IF q.status = 'out_of_range' THEN
    RAISE EXCEPTION 'The delivery location is too far from your store. The longest delivery we do is %.', public.km_text(public.max_trip_km());
  END IF;

  SELECT * INTO d FROM public.apply_promotion('rider_request', v_vendor, v_vendor, 0, q.delivery_fee, q.charge,
                                              q.distance_km, q.vehicle_type, p_coupon_code);
  IF d.coupon_status = 'invalid' THEN
    RAISE EXCEPTION '%', d.coupon_message;
  END IF;
  v_total := GREATEST(q.total_amount - COALESCE(d.discount_amount, 0), 0);

  -- Wallet first
  SELECT available_balance INTO v_wallet FROM public.vendor_wallet WHERE vendor_id = v_vendor FOR UPDATE;
  v_wallet := LEAST(COALESCE(v_wallet, 0), v_total);

  INSERT INTO public.orders (
    order_type, customer_id, vendor_id, status, payment_status, delivery_type,
    delivery_address, subtotal, delivery_fee, service_charge, total_amount,
    distance_km, base_rate, distance_fee, wallet_amount, special_instructions,
    preferred_vehicle_type, vehicle_rate_per_km,
    promotion_id, coupon_code, discount_amount, discount_target, discount_bearer
  ) VALUES (
    'rider_request', NULL, v_vendor, 'pending', 'pending', 'standard',
    public.delivery_point(p_location, p_recipient_name, p_recipient_phone, p_recipient_email),
    0, q.delivery_fee, q.charge, v_total,
    q.distance_km, q.base_rate, q.distance_fee, v_wallet, NULLIF(trim(p_package_details), ''),
    q.vehicle_type, q.rate_per_km,
    d.promotion_id, CASE WHEN d.coupon_status = 'applied' THEN upper(trim(p_coupon_code)) END,
    COALESCE(d.discount_amount, 0), d.discount_target, d.discount_bearer
  )
  RETURNING * INTO v_order;

  IF v_wallet > 0 THEN
    UPDATE public.vendor_wallet SET available_balance = available_balance - v_wallet, updated_at = now()
    WHERE vendor_id = v_vendor;
    INSERT INTO public.vendor_transactions (
      vendor_id, transaction_id, type, amount, fee, net_amount, status, description,
      reference_id, reference_type, processed_at, metadata
    ) VALUES (
      v_vendor, 'RRQ-' || v_order.order_number, 'adjustment', v_wallet, 0, -v_wallet, 'completed',
      'Rider request ' || v_order.order_number || ' paid from wallet', v_order.id, 'order', now(),
      jsonb_build_object('order_number', v_order.order_number)
    );
  END IF;

  IF p_save_customer THEN
    INSERT INTO public.vendor_customers (
      vendor_id, name, phone, email, place_name, formatted_address, street, city, state, country,
      place_id, latitude, longitude, directions
    ) VALUES (
      v_vendor, trim(p_recipient_name), trim(p_recipient_phone), lower(trim(p_recipient_email)), p_location ->> 'place_name',
      p_location ->> 'formatted_address', p_location ->> 'street', p_location ->> 'city',
      p_location ->> 'state', p_location ->> 'country', p_location ->> 'place_id', v_lat, v_lng,
      NULLIF(p_location ->> 'directions', '')
    );
  END IF;

  -- Fully covered by the wallet: live now
  IF v_wallet >= v_total THEN
    PERFORM public.activate_rider_request(v_order.id, 'WALLET-' || v_order.order_number, 'wallet', '{}');
    SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  END IF;

  RETURN v_order;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.create_rider_request(TEXT, TEXT, TEXT, JSONB, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rider_request(TEXT, TEXT, TEXT, JSONB, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;

-- ===================================================================
-- Admin
-- ===================================================================

DROP FUNCTION IF EXISTS public.admin_save_promotion(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID, TEXT, NUMERIC, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN);
CREATE OR REPLACE FUNCTION public.admin_save_promotion(
  p_name TEXT,
  p_discount_type TEXT,
  p_discount_value NUMERIC,
  p_applies_to TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_audience TEXT DEFAULT 'customer',
  p_id UUID DEFAULT NULL,
  p_code TEXT DEFAULT NULL,
  p_vendor_id UUID DEFAULT NULL,
  p_cost_bearer TEXT DEFAULT 'cydex',
  p_max_distance_km NUMERIC DEFAULT NULL,
  p_vehicle_types TEXT[] DEFAULT NULL,
  p_max_users INTEGER DEFAULT NULL,
  p_max_uses_per_user INTEGER DEFAULT NULL,
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
                                   audience, max_users, max_uses_per_user)
    VALUES (v_name, v_code, p_discount_type, p_discount_value, p_applies_to, v_vendor, v_bearer,
            p_max_distance_km, v_vehicles, p_starts_at, p_ends_at, COALESCE(p_is_active, true), auth.uid(),
            v_audience, p_max_users, p_max_uses_per_user)
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
        audience = v_audience, max_users = p_max_users, max_uses_per_user = p_max_uses_per_user
    WHERE id = p_id;
  END IF;

  PERFORM public.log_admin_action(CASE WHEN p_id IS NULL THEN 'create_promotion' ELSE 'update_promotion' END,
    'promotion', v_id::text, v_old, (SELECT to_jsonb(p) FROM public.promotions p WHERE id = v_id));
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_save_promotion(TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID, TEXT, NUMERIC, TEXT[], INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_promotion(TEXT, TEXT, NUMERIC, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, UUID, TEXT, NUMERIC, TEXT[], INTEGER, INTEGER, BOOLEAN) TO authenticated;

-- Promotions with how much they've been used
DROP FUNCTION IF EXISTS public.admin_promotions();
CREATE OR REPLACE FUNCTION public.admin_promotions()
RETURNS TABLE (
  id UUID, name TEXT, code TEXT, discount_type TEXT, discount_value NUMERIC, applies_to TEXT, vendor_id UUID,
  vendor_name TEXT, cost_bearer TEXT, max_distance_km NUMERIC, vehicle_types TEXT[], starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ, is_active BOOLEAN, created_at TIMESTAMPTZ, state TEXT, uses BIGINT, total_discount NUMERIC,
  audience TEXT, max_users INTEGER, max_uses_per_user INTEGER, users BIGINT
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
         p.audience, p.max_users, p.max_uses_per_user, u.users
  FROM public.promotions p
  LEFT JOIN public.profiles v ON v.id = p.vendor_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(sum(x.uses), 0)::bigint AS uses, count(*)::bigint AS users FROM public.promotion_uses(p.id) x
  ) u
  ORDER BY p.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_promotions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_promotions() TO authenticated;

-- ===================================================================
-- "Offers for you": the automatic promotions the signed-in person can still
-- use (coupon codes aren't listed; they're given out by Cydex)
-- ===================================================================
CREATE OR REPLACE FUNCTION public.my_promotions()
RETURNS TABLE (
  id UUID, name TEXT, discount_type TEXT, discount_value NUMERIC, applies_to TEXT, vendor_id UUID, vendor_name TEXT,
  max_distance_km NUMERIC, vehicle_types TEXT[], ends_at TIMESTAMPTZ, uses_left INTEGER, places_left INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.discount_type, p.discount_value, p.applies_to, p.vendor_id, v.name,
         p.max_distance_km, p.vehicle_types, p.ends_at, room.uses_left,
         CASE WHEN p.max_users IS NULL THEN NULL
              ELSE GREATEST(p.max_users - (SELECT count(*) FROM public.promotion_uses(p.id)), 0)::int END
  FROM public.promotions p
  JOIN public.profiles me ON me.id = auth.uid()
  LEFT JOIN public.profiles v ON v.id = p.vendor_id
  CROSS JOIN LATERAL public.promotion_room(p.id, me.id) room
  WHERE p.is_active AND p.code IS NULL
    AND now() >= p.starts_at AND now() < p.ends_at
    AND lower(me.role) IN ('customer', 'vendor', 'rider')
    AND p.audience IN (lower(me.role), 'all')
    AND CASE lower(me.role)
          WHEN 'customer' THEN p.applies_to IN ('service_charge', 'delivery_fee', 'items')
          WHEN 'vendor' THEN p.applies_to IN ('service_charge', 'delivery_fee', 'commission')
          ELSE p.applies_to = 'commission' END
    AND room.eligible
  ORDER BY p.ends_at;
$$;
REVOKE EXECUTE ON FUNCTION public.my_promotions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_promotions() TO authenticated;

-- ===================================================================
-- Money view: commission promotions are a cost to Cydex too
-- (customer paid = vendor + rider + Cydex still holds: they're already in
-- what the vendor and rider got)
-- ===================================================================
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
  CASE WHEN o.discount_bearer = 'vendor' THEN 0 ELSE COALESCE(o.discount_amount, 0) END
    + COALESCE(o.vendor_commission_discount, 0) + COALESCE(o.rider_commission_discount, 0) AS promo_cost
FROM public.orders o
LEFT JOIN public.payment_holds h ON h.order_id = o.id
WHERE o.status = 'delivered';
