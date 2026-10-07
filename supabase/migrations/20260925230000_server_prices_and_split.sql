-- ===================================================================
-- Minimum-fare delivery pricing, item prices from the database, and the
-- revenue split. See docs/PRICING_MODEL_IMPLEMENTATION_PLAN.md
--
--   delivery fee = the higher of ₦600 or ₦200 × km   (₦600 is a minimum)
--   rider        = 85% of the delivery fee (Cydex keeps 15%); no eco bonus
--   vendor       = items total minus Cydex's 10% commission
--   customer     = items + 15% Service Charge + delivery fee (unchanged)
--
-- Orders are now created only through place_order(), which looks up every
-- item's price in products; the app sends product ids and quantities only.
-- ===================================================================

-- ===================================================================
-- 1. Settings and new columns
-- ===================================================================

ALTER TABLE public.pricing_config
  ADD COLUMN IF NOT EXISTS rider_share_rate DECIMAL(5,4) DEFAULT 0.85,
  ADD COLUMN IF NOT EXISTS vendor_commission_rate DECIMAL(5,4) DEFAULT 0.10;

UPDATE public.pricing_config SET rider_share_rate = 0.85, vendor_commission_rate = 0.10;

-- What the rider earns for this delivery (their share of the delivery fee)
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS rider_earning DECIMAL(12,2);

UPDATE public.deliveries SET rider_earning = round(COALESCE(delivery_fee, 0) * 0.85, 2)
WHERE rider_earning IS NULL;

-- Which product each order line came from
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

-- ===================================================================
-- 2. Delivery fee: ₦600 is a minimum, not added on top
-- ===================================================================

CREATE OR REPLACE FUNCTION public.calculate_order_price(
  p_vendor_id UUID,
  p_address_id UUID,
  p_subtotal NUMERIC,
  OUT status TEXT,
  OUT distance_km NUMERIC,
  OUT base_rate NUMERIC,
  OUT distance_fee NUMERIC,
  OUT delivery_fee NUMERIC,
  OUT service_charge NUMERIC,
  OUT total_amount NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.pricing_config%ROWTYPE;
  v_store public.addresses%ROWTYPE;
  v_dest public.addresses%ROWTYPE;
  v_distance_m DOUBLE PRECISION;
BEGIN
  SELECT * INTO v_config FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  service_charge := round(COALESCE(p_subtotal, 0) * COALESCE(v_config.service_charge_rate, 0.15), 2);

  SELECT * INTO v_dest FROM public.addresses WHERE id = p_address_id;
  SELECT * INTO v_store FROM public.addresses
  WHERE profile_id = p_vendor_id
  ORDER BY is_default DESC, created_at DESC
  LIMIT 1;

  IF v_dest.id IS NULL THEN
    status := 'no_address';
    RETURN;
  END IF;
  IF v_store.id IS NULL THEN
    status := 'no_store';
    RETURN;
  END IF;

  v_distance_m := public.distance_m(v_store.latitude, v_store.longitude, v_dest.latitude, v_dest.longitude);
  distance_km := round((v_distance_m / 1000)::numeric, 2);
  base_rate := COALESCE(v_config.base_rate, 600);                                      -- minimum fare
  distance_fee := round(distance_km * COALESCE(v_config.distance_rate_per_km, 200), 2); -- per-km price
  delivery_fee := GREATEST(base_rate, distance_fee);
  total_amount := COALESCE(p_subtotal, 0) + service_charge + delivery_fee;
  status := CASE WHEN v_distance_m <= public.customer_vendor_radius_m() THEN 'ok' ELSE 'out_of_range' END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_order_price(UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- 3. Item prices come from products, never from the app
-- ===================================================================

-- Items total for a cart of [{ "product_id": uuid, "quantity": int }] from one
-- vendor, using current product prices. Rejects unknown, other-vendor or
-- unavailable products and bad quantities.
CREATE OR REPLACE FUNCTION public.cart_subtotal(p_vendor_id UUID, p_items JSONB)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC := 0;
  v_item JSONB;
  v_product public.products%ROWTYPE;
  v_quantity INTEGER;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := (v_item ->> 'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'Each item needs a quantity of at least 1';
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = (v_item ->> 'product_id')::uuid;
    IF v_product.id IS NULL OR v_product.vendor_id IS DISTINCT FROM p_vendor_id THEN
      RAISE EXCEPTION 'An item in your cart is no longer sold by this vendor';
    END IF;
    IF v_product.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION '% is not available right now', v_product.name;
    END IF;

    v_total := v_total + v_product.price * v_quantity;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cart_subtotal(UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- Checkout quote: items priced from products, delivery from the address
DROP FUNCTION IF EXISTS public.quote_order(UUID, UUID, NUMERIC);
CREATE FUNCTION public.quote_order(p_vendor_id UUID, p_address_id UUID, p_items JSONB)
RETURNS TABLE (
  status TEXT,
  subtotal NUMERIC,
  distance_km NUMERIC,
  base_rate NUMERIC,
  distance_fee NUMERIC,
  delivery_fee NUMERIC,
  service_charge NUMERIC,
  total_amount NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.status, s.subtotal, p.distance_km, p.base_rate, p.distance_fee, p.delivery_fee, p.service_charge, p.total_amount
  FROM (SELECT public.cart_subtotal(p_vendor_id, p_items) AS subtotal) s
  CROSS JOIN LATERAL public.calculate_order_price(
    p_vendor_id,
    (SELECT a.id FROM public.addresses a WHERE a.id = p_address_id AND a.profile_id = auth.uid()),
    s.subtotal
  ) p;
$$;

REVOKE EXECUTE ON FUNCTION public.quote_order(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_order(UUID, UUID, JSONB) TO authenticated;

-- Places an order for the logged-in customer: prices the items from
-- products, copies the delivery address, and creates the order and its items
-- in one go. price_new_order then adds the delivery fee and Service Charge
-- (and rejects vendors over 5 km away or without a store location).
CREATE OR REPLACE FUNCTION public.place_order(
  p_vendor_id UUID,
  p_address_id UUID,
  p_items JSONB,
  p_special_instructions TEXT DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer UUID := auth.uid();
  v_subtotal NUMERIC;
  v_address public.addresses%ROWTYPE;
  v_phone TEXT;
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'Log in to place an order';
  END IF;

  v_subtotal := public.cart_subtotal(p_vendor_id, p_items);

  SELECT * INTO v_address FROM public.addresses WHERE id = p_address_id AND profile_id = v_customer;
  IF v_address.id IS NULL THEN
    RAISE EXCEPTION 'Choose one of your saved delivery addresses';
  END IF;
  SELECT phone INTO v_phone FROM public.profiles WHERE id = v_customer;

  INSERT INTO public.orders (
    customer_id, vendor_id, status, payment_status, delivery_type,
    delivery_address, delivery_address_id, subtotal, total_amount, special_instructions
  ) VALUES (
    v_customer, p_vendor_id, 'pending', 'pending', 'standard',
    public.address_snapshot(v_address) || jsonb_build_object('phone', COALESCE(v_phone, '')),
    v_address.id, v_subtotal, v_subtotal, p_special_instructions
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

  RETURN v_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_order(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(UUID, UUID, JSONB, TEXT) TO authenticated;

-- Customers can no longer write orders or order items directly (that's how
-- a browser could set its own prices); place_order() does it for them.
DROP POLICY IF EXISTS "Customers can create orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can add items to their own orders" ON public.order_items;

-- ===================================================================
-- 4. Revenue split
-- ===================================================================

-- vendor_amount = items − 10% commission; platform_fee = that commission;
-- rider_amount = 85% of the delivery fee
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
    v_config public.pricing_config%ROWTYPE;
BEGIN
    SELECT COALESCE(subtotal, 0), COALESCE(delivery_fee, 0)
    INTO v_subtotal, v_delivery_fee
    FROM public.orders
    WHERE id = p_order_id;

    SELECT * INTO v_config FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;

    platform_fee := round(v_subtotal * COALESCE(v_config.vendor_commission_rate, 0.10), 2);
    vendor_amount := v_subtotal - platform_fee;
    rider_amount := round(v_delivery_fee * COALESCE(v_config.rider_share_rate, 0.85), 2);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_settlement_amounts(UUID) FROM PUBLIC, anon, authenticated;

-- Delivery rows now record what the rider will earn
CREATE OR REPLACE FUNCTION public.create_delivery_for_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.addresses%ROWTYPE;
  v_rider_share NUMERIC;
BEGIN
  IF (OLD.status != NEW.status AND NEW.status IN ('accepted', 'processing')) AND
     NEW.payment_status = 'paid' AND
     NEW.delivery_type != 'pickup' THEN

    SELECT * INTO v_store
    FROM public.addresses
    WHERE profile_id = NEW.vendor_id
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1;

    SELECT COALESCE(rider_share_rate, 0.85) INTO v_rider_share
    FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;

    INSERT INTO public.deliveries (
      order_id,
      status,
      estimated_pickup_time,
      estimated_delivery_time,
      delivery_fee,
      rider_earning,
      pickup_location,
      pickup_address_id,
      delivery_location,
      delivery_address_id
    ) VALUES (
      NEW.id,
      'available',
      NOW() + INTERVAL '30 minutes',
      NOW() + INTERVAL '60 minutes',
      NEW.delivery_fee,
      round(COALESCE(NEW.delivery_fee, 0) * COALESCE(v_rider_share, 0.85), 2),
      CASE
        WHEN v_store.id IS NULL
          THEN jsonb_build_object('address', 'Vendor Location', 'vendor_id', NEW.vendor_id)
        ELSE public.address_snapshot(v_store) || jsonb_build_object('vendor_id', NEW.vendor_id)
      END,
      v_store.id,
      NEW.delivery_address,
      NEW.delivery_address_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Settlement on delivery: vendor gets items − 10%, rider gets 85% of the
-- delivery fee (no eco bonus). Cydex keeps the Service Charge, the vendor
-- commission and 15% of the delivery fee.
CREATE OR REPLACE FUNCTION public.process_order_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment_hold RECORD;
    v_vendor_settlement_id UUID;
    v_vendor_transaction_id TEXT;
    v_rider_transaction_id TEXT;
    v_cydex_delivery_share DECIMAL(12,2);
BEGIN
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
        SELECT * INTO v_payment_hold
        FROM public.payment_holds
        WHERE order_id = NEW.id AND status = 'held';

        IF v_payment_hold.id IS NULL THEN
            RAISE WARNING 'No payment hold found for delivered order %', NEW.id;
            RETURN NEW;
        END IF;

        v_vendor_transaction_id := 'VTX-' || NEW.order_number || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT;
        v_rider_transaction_id := 'RTX-' || NEW.order_number || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT;
        v_cydex_delivery_share := COALESCE(NEW.delivery_fee, 0) - v_payment_hold.rider_amount;

        IF NEW.vendor_id IS NOT NULL THEN
            INSERT INTO public.settlements (
                order_id, recipient_id, recipient_type, amount, fee,
                net_amount, status, payment_reference, metadata
            ) VALUES (
                NEW.id, NEW.vendor_id, 'vendor',
                v_payment_hold.vendor_amount + v_payment_hold.platform_fee, v_payment_hold.platform_fee, v_payment_hold.vendor_amount,
                'completed', v_payment_hold.payment_reference,
                jsonb_build_object('order_number', NEW.order_number)
            )
            RETURNING id INTO v_vendor_settlement_id;

            INSERT INTO public.vendor_transactions (
                vendor_id, transaction_id, type, amount, fee, net_amount, status,
                description, reference_id, reference_type, processed_at, metadata
            ) VALUES (
                NEW.vendor_id, v_vendor_transaction_id, 'sale',
                v_payment_hold.vendor_amount + v_payment_hold.platform_fee, v_payment_hold.platform_fee, v_payment_hold.vendor_amount,
                'completed', 'Order ' || NEW.order_number || ' sale',
                NEW.id, 'order', NOW(),
                jsonb_build_object(
                    'order_number', NEW.order_number,
                    'settlement_id', v_vendor_settlement_id
                )
            );

            INSERT INTO public.vendor_wallet (vendor_id, available_balance, total_earned)
            VALUES (NEW.vendor_id, v_payment_hold.vendor_amount, v_payment_hold.vendor_amount)
            ON CONFLICT (vendor_id) DO UPDATE
            SET
                available_balance = vendor_wallet.available_balance + v_payment_hold.vendor_amount,
                total_earned = vendor_wallet.total_earned + v_payment_hold.vendor_amount,
                updated_at = NOW();
        END IF;

        IF NEW.rider_id IS NOT NULL THEN
            INSERT INTO public.settlements (
                order_id, recipient_id, recipient_type, amount, fee,
                net_amount, status, payment_reference, metadata
            ) VALUES (
                NEW.id, NEW.rider_id, 'rider',
                COALESCE(NEW.delivery_fee, 0), v_cydex_delivery_share, v_payment_hold.rider_amount,
                'completed', v_payment_hold.payment_reference,
                jsonb_build_object('order_number', NEW.order_number)
            );

            INSERT INTO public.rider_earnings (
                rider_id, delivery_id, order_id, delivery_fee, eco_bonus, tip_amount,
                total_earnings, status, earnings_date, released_at
            ) VALUES (
                NEW.rider_id,
                (SELECT id FROM public.deliveries WHERE order_id = NEW.id LIMIT 1),
                NEW.id,
                v_payment_hold.rider_amount, 0, 0,
                v_payment_hold.rider_amount,
                'released', CURRENT_DATE, NOW()
            );

            INSERT INTO public.rider_transactions (
                rider_id, transaction_id, type, amount, fee, net_amount, status,
                description, reference_id, reference_type, processed_at, metadata
            ) VALUES (
                NEW.rider_id, v_rider_transaction_id, 'earning',
                COALESCE(NEW.delivery_fee, 0), v_cydex_delivery_share, v_payment_hold.rider_amount,
                'completed', 'Delivery for order ' || NEW.order_number,
                NEW.id, 'order', NOW(),
                jsonb_build_object(
                    'order_number', NEW.order_number,
                    'delivery_fee', NEW.delivery_fee
                )
            );

            INSERT INTO public.rider_wallet (rider_id, available_balance, total_earned)
            VALUES (NEW.rider_id, v_payment_hold.rider_amount, v_payment_hold.rider_amount)
            ON CONFLICT (rider_id) DO UPDATE
            SET
                available_balance = rider_wallet.available_balance + v_payment_hold.rider_amount,
                total_earned = rider_wallet.total_earned + v_payment_hold.rider_amount,
                updated_at = NOW();
        END IF;

        UPDATE public.payment_holds
        SET
            status = 'released',
            vendor_released_at = CASE WHEN NEW.vendor_id IS NOT NULL THEN NOW() ELSE NULL END,
            rider_released_at = CASE WHEN NEW.rider_id IS NOT NULL THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = v_payment_hold.id;
    END IF;

    RETURN NEW;
END;
$$;
