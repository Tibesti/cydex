-- ===================================================================
-- Request a rider (vendors)
--
-- A vendor whose own customer reached them directly asks Cydex for a rider.
-- The request is an order with order_type = 'rider_request': no items and no
-- customer account. The recipient's name, phone and location are kept in
-- delivery_address. The vendor pays the delivery fee plus a 10% commission on
-- it (pricing_config.rider_request_commission_rate): from their wallet first,
-- and by card (Squad) for any shortfall. Once paid it goes straight to
-- ready_for_pickup and follows the normal flow; the vendor gets the delivery
-- code to share with the recipient. The rider gets their usual 85% of the
-- delivery fee; Cydex keeps the rest plus the commission.
-- See docs/ORDER_FLOW.md → Request a rider.
-- ===================================================================

ALTER TABLE public.pricing_config ADD COLUMN IF NOT EXISTS rider_request_commission_rate NUMERIC(5,4) DEFAULT 0.10;
UPDATE public.pricing_config SET rider_request_commission_rate = 0.10 WHERE rider_request_commission_rate IS NULL;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check CHECK (order_type IN ('customer', 'rider_request'));
-- Part of the total paid from the vendor's wallet (rider requests)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS wallet_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
-- Wallet part already refunded (a request cancelled before its card payment)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS wallet_refunded NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_customer_required CHECK (order_type = 'rider_request' OR customer_id IS NOT NULL);

-- Prices, payment split and the delivery details are fixed once created
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

CREATE OR REPLACE FUNCTION public.price_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price RECORD;
BEGIN
  -- Rider requests are priced by create_rider_request()
  IF NEW.order_type = 'rider_request' THEN
    RETURN NEW;
  END IF;

  IF NEW.delivery_type = 'pickup' THEN
    -- Customer collects from the store: no delivery fee
    SELECT * INTO v_price FROM public.calculate_order_price(NEW.vendor_id, NULL, NEW.subtotal);
    NEW.distance_km := NULL;
    NEW.base_rate := NULL;
    NEW.distance_fee := NULL;
    NEW.delivery_fee := 0;
    NEW.service_charge := v_price.service_charge;
    NEW.total_amount := COALESCE(NEW.subtotal, 0) + v_price.service_charge;
    RETURN NEW;
  END IF;

  IF NEW.delivery_address_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.addresses WHERE id = NEW.delivery_address_id AND profile_id = NEW.customer_id) THEN
    RAISE EXCEPTION 'Choose one of your saved delivery addresses';
  END IF;

  SELECT * INTO v_price FROM public.calculate_order_price(NEW.vendor_id, NEW.delivery_address_id, NEW.subtotal);

  IF v_price.status = 'no_store' THEN
    RAISE EXCEPTION 'This vendor has not set a store location yet, so it can''t take delivery orders';
  ELSIF v_price.status = 'out_of_range' THEN
    RAISE EXCEPTION 'This vendor is more than 5 km from your delivery address';
  END IF;

  NEW.distance_km := v_price.distance_km;
  NEW.base_rate := v_price.base_rate;
  NEW.distance_fee := v_price.distance_fee;
  NEW.delivery_fee := v_price.delivery_fee;
  NEW.service_charge := v_price.service_charge;
  NEW.total_amount := v_price.total_amount;
  RETURN NEW;
END;
$$;


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

        -- Rider requests have no items, so there's nothing to credit the vendor
        IF NEW.vendor_id IS NOT NULL AND v_payment_hold.vendor_amount + v_payment_hold.platform_fee > 0 THEN
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


-- ===================================================================
-- Saved customers (a vendor's own address book for rider requests)
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.vendor_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  place_name TEXT,
  formatted_address TEXT NOT NULL,
  street TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  place_id TEXT,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  directions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_customers_vendor_id ON public.vendor_customers (vendor_id);
ALTER TABLE public.vendor_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vendors manage their saved customers" ON public.vendor_customers
  FOR ALL USING (vendor_id = auth.uid()) WITH CHECK (vendor_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_customers TO authenticated;

-- ===================================================================
-- Pricing
-- ===================================================================

-- What a request to this location costs: delivery fee (same as customer
-- orders) + commission, and how much the vendor's wallet covers.
-- status: ok | out_of_range | no_store
CREATE OR REPLACE FUNCTION public.rider_request_quote(p_latitude DOUBLE PRECISION, p_longitude DOUBLE PRECISION)
RETURNS TABLE (
  status TEXT,
  distance_km NUMERIC,
  base_rate NUMERIC,
  distance_fee NUMERIC,
  delivery_fee NUMERIC,
  commission NUMERIC,
  total_amount NUMERIC,
  wallet_balance NUMERIC,
  wallet_amount NUMERIC,
  card_amount NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.pricing_config%ROWTYPE;
  v_store public.addresses%ROWTYPE;
  v_m DOUBLE PRECISION;
BEGIN
  SELECT * INTO v_config FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_store FROM public.addresses WHERE profile_id = auth.uid()
  ORDER BY is_default DESC, created_at DESC LIMIT 1;
  SELECT COALESCE(available_balance, 0) INTO wallet_balance FROM public.vendor_wallet WHERE vendor_id = auth.uid();
  wallet_balance := COALESCE(wallet_balance, 0);

  IF v_store.id IS NULL THEN
    status := 'no_store';
    RETURN NEXT;
    RETURN;
  END IF;

  v_m := public.distance_m(v_store.latitude, v_store.longitude, p_latitude, p_longitude);
  distance_km := round((v_m / 1000)::numeric, 2);
  base_rate := COALESCE(v_config.base_rate, 600);
  distance_fee := round(distance_km * COALESCE(v_config.distance_rate_per_km, 200), 2);
  delivery_fee := GREATEST(base_rate, distance_fee);
  commission := round(delivery_fee * COALESCE(v_config.rider_request_commission_rate, 0.10), 2);
  total_amount := delivery_fee + commission;
  wallet_amount := LEAST(wallet_balance, total_amount);
  card_amount := total_amount - wallet_amount;
  status := CASE WHEN v_m <= public.customer_vendor_radius_m() THEN 'ok' ELSE 'out_of_range' END;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rider_request_quote(DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_request_quote(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- Once paid: straight to ready_for_pickup with both handover codes. Nearby
-- riders are notified and the delivery is created by the existing triggers.
CREATE OR REPLACE FUNCTION public.activate_rider_request(p_order_id UUID, p_reference TEXT, p_gateway TEXT, p_details JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('cydex.order_flow', 'on', true);
  UPDATE public.orders
  SET payment_status = 'paid', payment_reference = p_reference, payment_gateway = p_gateway,
      payment_details = COALESCE(p_details, '{}'),
      status = 'ready_for_pickup', vendor_accepted_at = now(), ready_for_pickup_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_handover_codes (order_id, kind, code)
  VALUES (p_order_id, 'pickup', public.new_handover_code()),
         (p_order_id, 'delivery', public.new_handover_code())
  ON CONFLICT (order_id, kind) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activate_rider_request(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- Creating and cancelling a request
-- ===================================================================

-- p_location: { formatted_address, place_name, street, city, state, country,
--               place_id, latitude, longitude, directions }
-- Takes what it can from the vendor's wallet now; if that covers it all the
-- request is live immediately, otherwise the vendor pays the rest by card
-- (squad-checkout) and it goes live when Squad confirms.
CREATE OR REPLACE FUNCTION public.create_rider_request(
  p_recipient_name TEXT,
  p_recipient_phone TEXT,
  p_location JSONB,
  p_package_details TEXT DEFAULT NULL,
  p_save_customer BOOLEAN DEFAULT false
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor UUID := auth.uid();
  v_lat DOUBLE PRECISION := (p_location ->> 'latitude')::double precision;
  v_lng DOUBLE PRECISION := (p_location ->> 'longitude')::double precision;
  q RECORD;
  v_wallet NUMERIC;
  v_order public.orders%ROWTYPE;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'vendor' THEN
    RAISE EXCEPTION 'Only vendors can request a rider';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_vendor AND public.is_valid_phone(phone)) THEN
    RAISE EXCEPTION 'Add a phone number to your profile before requesting a rider';
  END IF;
  IF NULLIF(trim(p_recipient_name), '') IS NULL THEN
    RAISE EXCEPTION 'Enter the name of the person receiving the delivery';
  END IF;
  IF NOT public.is_valid_phone(p_recipient_phone) THEN
    RAISE EXCEPTION 'Enter a valid phone number for the person receiving the delivery';
  END IF;
  IF v_lat IS NULL OR v_lng IS NULL OR NULLIF(p_location ->> 'formatted_address', '') IS NULL THEN
    RAISE EXCEPTION 'Choose the delivery location on the map';
  END IF;

  SELECT * INTO q FROM public.rider_request_quote(v_lat, v_lng);
  IF q.status = 'no_store' THEN
    RAISE EXCEPTION 'Set your store location in Settings before requesting a rider';
  ELSIF q.status = 'out_of_range' THEN
    RAISE EXCEPTION 'The delivery location is more than 5 km from your store';
  END IF;

  -- Wallet first
  SELECT available_balance INTO v_wallet FROM public.vendor_wallet WHERE vendor_id = v_vendor FOR UPDATE;
  v_wallet := LEAST(COALESCE(v_wallet, 0), q.total_amount);

  INSERT INTO public.orders (
    order_type, customer_id, vendor_id, status, payment_status, delivery_type,
    delivery_address, subtotal, delivery_fee, service_charge, total_amount,
    distance_km, base_rate, distance_fee, wallet_amount, special_instructions
  ) VALUES (
    'rider_request', NULL, v_vendor, 'pending', 'pending', 'standard',
    jsonb_build_object(
      'name', trim(p_recipient_name),
      'phone', trim(p_recipient_phone),
      'address', p_location ->> 'formatted_address',
      'formatted_address', p_location ->> 'formatted_address',
      'street', COALESCE(NULLIF(p_location ->> 'place_name', ''), NULLIF(p_location ->> 'street', ''),
                         split_part(p_location ->> 'formatted_address', ',', 1)),
      'city', COALESCE(p_location ->> 'city', ''),
      'state', COALESCE(p_location ->> 'state', ''),
      'country', COALESCE(p_location ->> 'country', ''),
      'place_id', p_location ->> 'place_id',
      'additional_info', COALESCE(p_location ->> 'directions', ''),
      'latitude', v_lat,
      'longitude', v_lng
    ),
    0, q.delivery_fee, q.commission, q.total_amount,
    q.distance_km, q.base_rate, q.distance_fee, v_wallet, NULLIF(trim(p_package_details), '')
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
      vendor_id, name, phone, place_name, formatted_address, street, city, state, country,
      place_id, latitude, longitude, directions
    ) VALUES (
      v_vendor, trim(p_recipient_name), trim(p_recipient_phone), p_location ->> 'place_name',
      p_location ->> 'formatted_address', p_location ->> 'street', p_location ->> 'city',
      p_location ->> 'state', p_location ->> 'country', p_location ->> 'place_id', v_lat, v_lng,
      NULLIF(p_location ->> 'directions', '')
    );
  END IF;

  -- Fully covered by the wallet: live now
  IF v_wallet >= q.total_amount THEN
    PERFORM public.activate_rider_request(v_order.id, 'WALLET-' || v_order.order_number, 'wallet', '{}');
    SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  END IF;

  RETURN v_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_rider_request(TEXT, TEXT, JSONB, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rider_request(TEXT, TEXT, JSONB, TEXT, BOOLEAN) TO authenticated;

-- Vendor cancels their request before a rider accepts; everything they paid
-- goes back to their wallet
CREATE OR REPLACE FUNCTION public.cancel_rider_request(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'vendor');
BEGIN
  IF o.order_type <> 'rider_request' THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.status NOT IN ('pending', 'ready_for_pickup') OR o.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'Requests can only be cancelled before a rider accepts them';
  END IF;

  UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Cancelled by vendor'
  WHERE id = o.id;
  UPDATE public.deliveries SET status = 'cancelled', cancelled_at = now()
  WHERE order_id = o.id AND status = 'available';

  PERFORM public.refund_order(o.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_rider_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_rider_request(UUID) TO authenticated;

-- Vendors cancel their own requests rather than "reject" them
CREATE OR REPLACE FUNCTION public.vendor_reject_order(p_order_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'vendor');
BEGIN
  IF o.order_type = 'rider_request' THEN
    RAISE EXCEPTION 'Cancel the rider request instead';
  END IF;
  IF o.status NOT IN ('pending', 'accepted', 'ready_for_pickup') OR o.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'Orders can only be rejected before a rider accepts them';
  END IF;

  UPDATE public.orders
  SET status = 'rejected', cancelled_at = now(), cancel_reason = NULLIF(trim(p_reason), '')
  WHERE id = o.id;
  UPDATE public.deliveries SET status = 'cancelled', cancelled_at = now()
  WHERE order_id = o.id AND status = 'available';

  PERFORM public.refund_order(o.id);
END;
$$;

-- ===================================================================
-- Refunds: rider requests go back to the vendor's wallet
-- (paid: the whole total; not yet paid by card: the wallet part taken so far)
-- ===================================================================

CREATE OR REPLACE FUNCTION public.refund_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_amount NUMERIC;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);

  IF o.order_type = 'rider_request' THEN
    -- Paid: everything not already refunded. Not paid yet: just the wallet part.
    v_amount := CASE WHEN o.payment_status = 'paid' THEN o.total_amount - o.wallet_refunded
                     WHEN o.payment_status IN ('pending', 'failed') THEN o.wallet_amount - o.wallet_refunded
                     ELSE 0 END;
    IF v_amount > 0 THEN
      UPDATE public.orders
      SET wallet_refunded = o.wallet_amount
      WHERE id = o.id;
      UPDATE public.vendor_wallet SET available_balance = available_balance + v_amount, updated_at = now()
      WHERE vendor_id = o.vendor_id;
      INSERT INTO public.vendor_transactions (
        vendor_id, transaction_id, type, amount, fee, net_amount, status, description,
        reference_id, reference_type, processed_at, metadata
      ) VALUES (
        o.vendor_id, 'REFUND-' || o.order_number || '-' || o.payment_status, 'refund', v_amount, 0, v_amount, 'completed',
        'Refund for rider request ' || o.order_number, o.id, 'order', now(),
        jsonb_build_object('order_number', o.order_number)
      );
      PERFORM public.notify_user(o.vendor_id, 'refund', 'Refund issued',
        '₦' || to_char(v_amount, 'FM999,999,990.00') || ' for rider request #' || o.order_number
        || ' has been added to your wallet.', o);
    END IF;
    IF o.payment_status = 'paid' THEN
      UPDATE public.payment_holds SET status = 'refunded', updated_at = now() WHERE order_id = o.id;
      UPDATE public.orders SET payment_status = 'refunded' WHERE id = o.id;
    END IF;
    RETURN;
  END IF;

  IF o.payment_status <> 'paid' THEN
    RETURN;
  END IF;

  INSERT INTO public.customer_wallet (customer_id, available_balance)
  VALUES (o.customer_id, o.total_amount)
  ON CONFLICT (customer_id) DO UPDATE
  SET available_balance = customer_wallet.available_balance + EXCLUDED.available_balance,
      updated_at = now();

  INSERT INTO public.customer_transactions (
    customer_id, transaction_id, type, amount, status, description,
    reference_id, reference_type, processed_at, metadata
  ) VALUES (
    o.customer_id, 'REFUND-' || o.order_number, 'refund', o.total_amount, 'completed',
    'Refund for order ' || o.order_number, o.id, 'order', now(),
    jsonb_build_object('reason', o.cancel_reason, 'payment_reference', o.payment_reference)
  );

  UPDATE public.payment_holds SET status = 'refunded', updated_at = now() WHERE order_id = o.id;
  UPDATE public.orders SET payment_status = 'refunded' WHERE id = o.id;

  PERFORM public.notify_user(o.customer_id, 'refund', 'Refund issued',
    '₦' || to_char(o.total_amount, 'FM999,999,990.00') || ' for order #' || o.order_number
    || ' has been added to your wallet.', o);
  PERFORM public.queue_email(o.customer_id, 'refund', 'Refund for order #' || o.order_number,
    jsonb_build_object('order_number', o.order_number, 'amount', o.total_amount));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_order(UUID) FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- Card payment confirmation: the card pays total minus the wallet part
-- ===================================================================

CREATE OR REPLACE FUNCTION public.confirm_order_payment(
  p_order_number TEXT, p_reference TEXT, p_amount NUMERIC, p_details JSONB DEFAULT '{}'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE order_number = p_order_number FOR UPDATE;
  IF o.id IS NULL THEN
    RETURN 'not_found';
  END IF;
  IF o.payment_status IN ('paid', 'refunded') THEN
    RETURN 'already_paid';
  END IF;
  IF round(p_amount, 2) <> round(o.total_amount - o.wallet_amount, 2) THEN
    RETURN 'amount_mismatch';
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);

  IF o.order_type = 'rider_request' AND o.status = 'pending' THEN
    PERFORM public.activate_rider_request(o.id, p_reference, 'squad', p_details);
    RETURN 'paid';
  END IF;

  UPDATE public.orders
  SET payment_status = 'paid', payment_reference = p_reference, payment_gateway = 'squad',
      payment_details = COALESCE(p_details, '{}')
  WHERE id = o.id;

  -- Paid after it was cancelled: give the money back
  IF o.status IN ('cancelled', 'rejected') THEN
    PERFORM public.refund_order(o.id);
    RETURN 'refunded';
  END IF;
  RETURN 'paid';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_order_payment(TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(TEXT, TEXT, NUMERIC, JSONB) TO service_role;

-- ===================================================================
-- Who sees what
-- ===================================================================

-- Vendors see their own rider requests whatever the payment state
CREATE POLICY "Vendors can view their rider requests" ON public.orders
  FOR SELECT USING (vendor_id = auth.uid() AND order_type = 'rider_request');

-- The vendor gives the recipient the delivery code for their requests
CREATE POLICY "Vendors see the delivery code for their rider requests" ON public.order_handover_codes
  FOR SELECT USING (
    kind = 'delivery'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_handover_codes.order_id AND o.vendor_id = auth.uid() AND o.order_type = 'rider_request'
    )
  );
