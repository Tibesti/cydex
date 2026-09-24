-- ===================================================================
-- Rebuild fixes
-- Runs after every earlier migration. Adds what the app code uses but no
-- migration created, and fixes triggers that would fail at runtime.
-- ===================================================================

-- ===================================================================
-- 1. COLUMNS THE APP USES THAT NO MIGRATION ADDED
-- ===================================================================

-- create_payment_hold() reads NEW.payment_gateway; OrderConfirmation and the
-- webhook handlers write both columns.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_gateway TEXT DEFAULT 'squad',
  ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}'::jsonb;

-- Written by the rider app when a delivery changes status (useRiderDeliveries).
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS picking_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivering_at TIMESTAMPTZ;

-- The admin payments page embeds orders!customer_transactions_reference_id_fkey.
-- Every customer transaction the app writes references an order (or nothing).
ALTER TABLE public.customer_transactions
  ADD CONSTRAINT customer_transactions_reference_id_fkey
  FOREIGN KEY (reference_id) REFERENCES public.orders(id) ON DELETE SET NULL;

-- ===================================================================
-- 2. SETTLEMENT TRIGGERS
-- These write rows that belong to other users (vendor and rider wallets,
-- notifications, deliveries), so they run as SECURITY DEFINER.
-- ===================================================================

-- Treat a missing subtotal / delivery fee as 0 so payment_holds' NOT NULL
-- columns never receive NULL.
CREATE OR REPLACE FUNCTION public.calculate_settlement_amounts(
    p_order_id UUID,
    OUT vendor_amount DECIMAL(12,2),
    OUT rider_amount DECIMAL(12,2),
    OUT platform_fee DECIMAL(12,2)
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_subtotal DECIMAL(12,2);
    v_delivery_fee DECIMAL(12,2);
BEGIN
    SELECT COALESCE(subtotal, 0), COALESCE(delivery_fee, 0)
    INTO v_subtotal, v_delivery_fee
    FROM public.orders
    WHERE id = p_order_id;

    -- Platform takes 10% from vendor sales
    platform_fee := v_subtotal * 0.10;
    vendor_amount := v_subtotal - platform_fee;

    -- Rider gets full delivery fee
    rider_amount := v_delivery_fee;
END;
$$;

-- Same as before, but a second "paid" update no longer fails on the unique
-- order_id in payment_holds.
CREATE OR REPLACE FUNCTION public.create_payment_hold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vendor_amount DECIMAL(12,2);
    v_rider_amount DECIMAL(12,2);
    v_platform_fee DECIMAL(12,2);
BEGIN
    IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
        SELECT * INTO v_vendor_amount, v_rider_amount, v_platform_fee
        FROM public.calculate_settlement_amounts(NEW.id);

        INSERT INTO public.payment_holds (
            order_id, payment_reference, total_amount, vendor_amount,
            rider_amount, platform_fee, status, metadata
        ) VALUES (
            NEW.id,
            COALESCE(NEW.payment_reference, ''),
            NEW.total_amount,
            v_vendor_amount,
            v_rider_amount,
            v_platform_fee,
            'held',
            jsonb_build_object(
                'subtotal', NEW.subtotal,
                'delivery_fee', NEW.delivery_fee,
                'payment_gateway', NEW.payment_gateway
            )
        )
        ON CONFLICT (order_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- The original used currval('settlements_id_seq'), but settlements.id is a
-- UUID with no sequence, so every "delivered" update failed. The settlement
-- id is now captured with RETURNING. Also skips the vendor side when an
-- order has no vendor instead of failing on the NOT NULL recipient_id.
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
    v_eco_bonus DECIMAL(12,2);
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

        -- Eco bonus for rider (5% of delivery fee)
        v_eco_bonus := v_payment_hold.rider_amount * 0.05;

        IF NEW.vendor_id IS NOT NULL THEN
            INSERT INTO public.settlements (
                order_id, recipient_id, recipient_type, amount, fee,
                net_amount, status, payment_reference, metadata
            ) VALUES (
                NEW.id, NEW.vendor_id, 'vendor',
                v_payment_hold.vendor_amount, 0, v_payment_hold.vendor_amount,
                'completed', v_payment_hold.payment_reference,
                jsonb_build_object('order_number', NEW.order_number)
            )
            RETURNING id INTO v_vendor_settlement_id;

            INSERT INTO public.vendor_transactions (
                vendor_id, transaction_id, type, amount, fee, net_amount, status,
                description, reference_id, reference_type, processed_at, metadata
            ) VALUES (
                NEW.vendor_id, v_vendor_transaction_id, 'sale',
                v_payment_hold.vendor_amount, v_payment_hold.platform_fee, v_payment_hold.vendor_amount,
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
                v_payment_hold.rider_amount + v_eco_bonus, 0, v_payment_hold.rider_amount + v_eco_bonus,
                'completed', v_payment_hold.payment_reference,
                jsonb_build_object('order_number', NEW.order_number, 'eco_bonus', v_eco_bonus)
            );

            INSERT INTO public.rider_earnings (
                rider_id, delivery_id, order_id, delivery_fee, eco_bonus, tip_amount,
                total_earnings, status, earnings_date, released_at
            ) VALUES (
                NEW.rider_id,
                (SELECT id FROM public.deliveries WHERE order_id = NEW.id LIMIT 1),
                NEW.id,
                v_payment_hold.rider_amount, v_eco_bonus, 0,
                v_payment_hold.rider_amount + v_eco_bonus,
                'released', CURRENT_DATE, NOW()
            );

            INSERT INTO public.rider_transactions (
                rider_id, transaction_id, type, amount, fee, net_amount, status,
                description, reference_id, reference_type, processed_at, metadata
            ) VALUES (
                NEW.rider_id, v_rider_transaction_id, 'earning',
                v_payment_hold.rider_amount + v_eco_bonus, 0, v_payment_hold.rider_amount + v_eco_bonus,
                'completed', 'Delivery for order ' || NEW.order_number,
                NEW.id, 'order', NOW(),
                jsonb_build_object(
                    'order_number', NEW.order_number,
                    'delivery_fee', v_payment_hold.rider_amount,
                    'eco_bonus', v_eco_bonus
                )
            );

            INSERT INTO public.rider_wallet (rider_id, available_balance, total_earned)
            VALUES (NEW.rider_id, v_payment_hold.rider_amount + v_eco_bonus, v_payment_hold.rider_amount + v_eco_bonus)
            ON CONFLICT (rider_id) DO UPDATE
            SET
                available_balance = rider_wallet.available_balance + v_payment_hold.rider_amount + v_eco_bonus,
                total_earned = rider_wallet.total_earned + v_payment_hold.rider_amount + v_eco_bonus,
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

-- Needs to see every rider (to notify them) and write their notifications.
ALTER FUNCTION public.notify_order_status_change() SECURITY DEFINER SET search_path = public;
-- Runs when a vendor accepts an order and inserts the delivery row.
ALTER FUNCTION public.create_delivery_for_order() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.create_order_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT) SET search_path = public;

-- A customer's review updates the rider's profile rating. Also handles
-- DELETE, where NEW is NULL.
CREATE OR REPLACE FUNCTION public.update_rider_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rider_id UUID := COALESCE(NEW.rider_id, OLD.rider_id);
  new_rating NUMERIC;
BEGIN
  SELECT average_rating INTO new_rating
  FROM public.calculate_rider_rating(v_rider_id);

  UPDATE public.rider_profiles
  SET rating = COALESCE(new_rating, 0), updated_at = now()
  WHERE id = v_rider_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ===================================================================
-- 3. FUNCTION CALLED BY THE WEBHOOK HANDLERS
-- ===================================================================

CREATE OR REPLACE FUNCTION public.update_customer_wallet_on_payment(p_customer_id UUID, p_amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_customer_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed to update another customer''s wallet';
  END IF;

  INSERT INTO public.customer_wallet (customer_id, total_spent)
  VALUES (p_customer_id, p_amount)
  ON CONFLICT (customer_id) DO UPDATE
  SET total_spent = customer_wallet.total_spent + EXCLUDED.total_spent,
      updated_at = now();
END;
$$;

-- ===================================================================
-- 4. POLICY FIXES
-- ===================================================================

-- Roles are stored lowercase, so role = 'ADMIN' never matched.
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
CREATE POLICY "Admins can manage announcements" ON public.announcements
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Vendors move orders to 'accepted' or 'ready_for_pickup' (useVendorOrders),
-- which the original rule missed, so riders never saw those orders.
DROP POLICY IF EXISTS "Riders can view available orders for pickup" ON public.orders;
CREATE POLICY "Riders can view available orders for pickup" ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'rider'
    AND payment_status = 'paid'
    AND status IN ('accepted', 'processing', 'ready', 'ready_for_pickup')
    AND rider_id IS NULL
    AND delivery_type != 'pickup'
  );

-- walletSetupService inserts the user's own virtual account from the browser;
-- the existing policies only allowed the service role to insert.
CREATE POLICY "users can create own virtual account" ON public.virtual_accounts
  FOR INSERT WITH CHECK (auth.uid() = profile_id);

-- ===================================================================
-- 5. API ACCESS
-- Explicit grants in case the project does not apply Supabase's default
-- table privileges. Row level security still decides which rows are visible.
-- ===================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- ===================================================================
-- 6. REALTIME (tables the app subscribes to)
-- ===================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['orders', 'deliveries', 'order_notifications', 'products', 'rider_earnings', 'vendor_stats'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ===================================================================
-- 7. PROFILES FOR ANY AUTH USERS THAT ALREADY EXIST
-- (e.g. accounts created before the sign-up trigger was in place)
-- ===================================================================

INSERT INTO public.profiles (id, email, name, role, email_verified_at)
SELECT
  u.id,
  u.email,
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1)),
  CASE
    WHEN lower(u.raw_user_meta_data ->> 'role') IN ('customer', 'vendor', 'rider')
      THEN lower(u.raw_user_meta_data ->> 'role')
    ELSE 'customer'
  END,
  u.email_confirmed_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
