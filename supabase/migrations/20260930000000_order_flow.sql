-- ===================================================================
-- Order flow: statuses, handover codes, notifications, refunds
-- See docs/ORDER_FLOW.md
--
--   pending ──(paid)──► accepted ──► ready_for_pickup ──► rider_assigned
--        │                 │                │                  │
--    cancelled         rejected ◄───────────┘              picking_up
--   (customer)         (vendor, before a rider accepts)        │
--                                              out_for_delivery (pickup code)
--                                                              │
--                                                  delivered (delivery code)
--
-- Every status change goes through one of the functions below, which check
-- who is allowed to make it and when. Payment status is only set by Squad's
-- confirmation (server-side) or a refund.
-- ===================================================================

-- ===================================================================
-- 1. Statuses
-- ===================================================================

UPDATE public.orders SET status = CASE status
  WHEN 'processing' THEN 'accepted'
  WHEN 'ready' THEN 'ready_for_pickup'
  WHEN 'picked_up' THEN 'out_for_delivery'
  WHEN 'delivering' THEN 'out_for_delivery'
  WHEN 'completed' THEN 'delivered'
  ELSE status END
WHERE status IN ('processing', 'ready', 'picked_up', 'delivering', 'completed');

UPDATE public.orders SET status = 'pending'
WHERE status NOT IN ('pending', 'accepted', 'ready_for_pickup', 'rider_assigned', 'picking_up',
                     'out_for_delivery', 'delivered', 'cancelled', 'rejected');

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'pending', 'accepted', 'ready_for_pickup', 'rider_assigned', 'picking_up',
  'out_for_delivery', 'delivered', 'cancelled', 'rejected'
));

UPDATE public.orders SET payment_status = 'pending'
WHERE payment_status NOT IN ('pending', 'paid', 'failed', 'refunded');
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_started_at TIMESTAMPTZ;

-- The old single verification code was shown to riders; handover codes replace it
DROP TRIGGER IF EXISTS set_verification_code_trigger ON public.orders;
UPDATE public.orders SET verification_code = NULL WHERE verification_code IS NOT NULL;
DROP POLICY IF EXISTS "Customers can view their order verification codes" ON public.orders;
DROP POLICY IF EXISTS "Riders can view verification codes for their assigned orders" ON public.orders;

-- The old notifications trigger used status names the app never wrote
DROP TRIGGER IF EXISTS notify_order_status_change_trigger ON public.orders;

-- Only the order functions below (or admins / server jobs) may change the
-- status, payment status or rider of an order.
CREATE OR REPLACE FUNCTION public.guard_order_flow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_admin()
     AND COALESCE(current_setting('cydex.order_flow', true), '') <> 'on' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Order status can only be changed through the order actions';
    END IF;
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'Payment status is set when Squad confirms the payment';
    END IF;
    IF NEW.rider_id IS DISTINCT FROM OLD.rider_id THEN
      RAISE EXCEPTION 'Riders are assigned by accepting the order';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_order_flow
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_flow();

-- ===================================================================
-- 2. Handover codes
--   pickup:   the rider shows it, the vendor enters it  -> out_for_delivery
--   delivery: the customer shows it, the rider enters it -> delivered
-- Each code is only visible to the person who gives it.
-- ===================================================================

CREATE TABLE public.order_handover_codes (
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pickup', 'delivery')),
  code TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, kind)
);

ALTER TABLE public.order_handover_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Riders see the pickup code for their orders" ON public.order_handover_codes
  FOR SELECT USING (
    kind = 'pickup'
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_handover_codes.order_id AND o.rider_id = auth.uid())
  );
CREATE POLICY "Customers see the delivery code for their orders" ON public.order_handover_codes
  FOR SELECT USING (
    kind = 'delivery'
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_handover_codes.order_id AND o.customer_id = auth.uid())
  );
CREATE POLICY "Admins can view handover codes" ON public.order_handover_codes
  FOR SELECT USING (public.is_admin());

GRANT SELECT ON public.order_handover_codes TO authenticated;

CREATE OR REPLACE FUNCTION public.new_handover_code()
RETURNS TEXT
LANGUAGE sql
VOLATILE
AS $$
  SELECT lpad(floor(random() * 10000)::int::text, 4, '0');
$$;

-- ===================================================================
-- 3. Notifications and email queue
-- ===================================================================

-- Emails waiting to be sent by the send-emails Edge Function
CREATE TABLE public.email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX idx_email_outbox_pending ON public.email_outbox (created_at) WHERE status = 'pending';
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view the email outbox" ON public.email_outbox FOR SELECT USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id) WHERE NOT is_read;

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id UUID, p_type TEXT, p_title TEXT, p_message TEXT, p_order public.orders DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, type, title, message, metadata)
  SELECT p_user_id, p_type, p_title, p_message,
         CASE WHEN p_order.id IS NULL THEN '{}'::jsonb
              ELSE jsonb_build_object('order_id', p_order.id, 'order_number', p_order.order_number) END
  WHERE p_user_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.queue_email(p_user_id UUID, p_template TEXT, p_subject TEXT, p_data JSONB)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.email_outbox (profile_id, to_email, template, subject, data)
  SELECT p.id, p.email, p_template, p_subject, p_data || jsonb_build_object('name', p.name)
  FROM public.profiles p
  WHERE p.id = p_user_id AND p.email IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, public.orders) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_email(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Welcome notification + email for every new account
CREATE OR REPLACE FUNCTION public.welcome_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_user(
    NEW.id, 'welcome', 'Welcome to Cydex',
    CASE lower(NEW.role)
      WHEN 'vendor' THEN 'Your store is set up. Add your store location and products to start receiving orders.'
      WHEN 'rider' THEN 'You''re all set. Keep your location on to see orders near you.'
      ELSE 'Add your delivery address and order from vendors near you.'
    END
  );
  PERFORM public.queue_email(NEW.id, 'welcome', 'Welcome to Cydex', jsonb_build_object('role', lower(NEW.role)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER welcome_new_user
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.welcome_new_user();

-- Notifications for every order event
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
      PERFORM public.notify_user(NEW.vendor_id, 'delivered', 'Order delivered',
        'Order ' || v_ref || ' was delivered. ₦' || to_char(COALESCE(v_hold.vendor_amount, 0), 'FM999,999,990.00')
        || ' has been added to your wallet.', NEW);
      PERFORM public.notify_user(NEW.rider_id, 'delivered', 'Delivery complete',
        'Order ' || v_ref || ' was delivered. ₦' || to_char(COALESCE(v_hold.rider_amount, 0), 'FM999,999,990.00')
        || ' has been added to your wallet.', NEW);

    WHEN 'cancelled' THEN
      PERFORM public.notify_user(NEW.customer_id, 'cancelled', 'Order cancelled',
        'You cancelled order ' || v_ref || '.', NEW);
      -- Vendors never saw unpaid orders, so only tell them about paid ones
      IF OLD.payment_status = 'paid' THEN
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

CREATE TRIGGER notify_order_events
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_events();

-- Live updates for the notifications page
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                     AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- ===================================================================
-- 4. Refunds (rejected or cancelled after payment)
-- ===================================================================

CREATE OR REPLACE FUNCTION public.refund_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.payment_status <> 'paid' THEN
    RETURN;
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);

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

-- Refunds used to be written from the vendor's browser; they now happen here
DROP POLICY IF EXISTS "Vendors can refund holds on their orders" ON public.payment_holds;
DROP POLICY IF EXISTS "Vendors can record refunds for their orders" ON public.customer_transactions;
DROP POLICY IF EXISTS "Vendors can view wallets of customers they are refunding" ON public.customer_wallet;
DROP POLICY IF EXISTS "Vendors can credit refunds to their customers" ON public.customer_wallet;
DROP POLICY IF EXISTS "Vendors can create a wallet for a refund" ON public.customer_wallet;

-- ===================================================================
-- 5. Payment confirmation (called by the Squad Edge Functions only,
--    after they've verified the transaction with Squad)
-- Returns: paid | already_paid | refunded | amount_mismatch | not_found
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
  IF round(p_amount, 2) <> round(o.total_amount, 2) THEN
    RETURN 'amount_mismatch';
  END IF;

  PERFORM set_config('cydex.order_flow', 'on', true);
  UPDATE public.orders
  SET payment_status = 'paid', payment_reference = p_reference, payment_gateway = 'squad',
      payment_details = COALESCE(p_details, '{}')
  WHERE id = o.id;

  -- Paid after the customer cancelled: give the money back
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
-- 6. Order actions (the only way to change an order's status)
-- ===================================================================

-- Locks the order and checks it belongs to the caller in the given role
CREATE OR REPLACE FUNCTION public.order_for_action(p_order_id UUID, p_as TEXT)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL
     OR (p_as = 'vendor' AND o.vendor_id IS DISTINCT FROM auth.uid())
     OR (p_as = 'customer' AND o.customer_id IS DISTINCT FROM auth.uid())
     OR (p_as = 'rider' AND o.rider_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  PERFORM set_config('cydex.order_flow', 'on', true);
  RETURN o;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.order_for_action(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Vendor: accept a paid order (creates both handover codes)
CREATE OR REPLACE FUNCTION public.vendor_accept_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'vendor');
BEGIN
  IF o.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'This order hasn''t been paid for yet';
  END IF;
  IF o.status <> 'pending' THEN
    RAISE EXCEPTION 'Only new orders can be accepted';
  END IF;

  UPDATE public.orders SET status = 'accepted', vendor_accepted_at = now() WHERE id = o.id;

  INSERT INTO public.order_handover_codes (order_id, kind, code)
  VALUES (o.id, 'pickup', public.new_handover_code()),
         (o.id, 'delivery', public.new_handover_code())
  ON CONFLICT (order_id, kind) DO NOTHING;
END;
$$;

-- Vendor: order is ready; riders nearby can now see and accept it
CREATE OR REPLACE FUNCTION public.vendor_mark_ready(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'vendor');
BEGIN
  IF o.status <> 'accepted' THEN
    RAISE EXCEPTION 'Only accepted orders can be marked ready';
  END IF;
  UPDATE public.orders SET status = 'ready_for_pickup', ready_for_pickup_at = now() WHERE id = o.id;
END;
$$;

-- Vendor: reject an order any time before a rider accepts it (refunds if paid)
CREATE OR REPLACE FUNCTION public.vendor_reject_order(p_order_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'vendor');
BEGIN
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

-- Customer: cancel before the vendor accepts (refunds if paid)
CREATE OR REPLACE FUNCTION public.customer_cancel_order(p_order_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'customer');
BEGIN
  IF o.status <> 'pending' THEN
    RAISE EXCEPTION 'Orders can only be cancelled before the vendor accepts them';
  END IF;

  UPDATE public.orders
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = NULLIF(trim(p_reason), '')
  WHERE id = o.id;

  PERFORM public.refund_order(o.id);
END;
$$;

-- Rider: accept an order that's ready, within their radius (one at a time)
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

-- Rider: heading to the vendor
CREATE OR REPLACE FUNCTION public.rider_start_pickup(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'rider');
BEGIN
  IF o.status <> 'rider_assigned' THEN
    RAISE EXCEPTION 'This order isn''t waiting for pickup';
  END IF;
  UPDATE public.orders SET status = 'picking_up', pickup_started_at = now() WHERE id = o.id;
  UPDATE public.deliveries SET status = 'picking_up', picking_up_at = now() WHERE order_id = o.id;
END;
$$;

-- Checks a handover code. Wrong codes are counted (and kept, so this returns
-- false instead of raising); 5 wrong tries locks the code.
CREATE OR REPLACE FUNCTION public.check_handover_code(p_order_id UUID, p_kind TEXT, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.order_handover_codes%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.order_handover_codes
  WHERE order_id = p_order_id AND kind = p_kind FOR UPDATE;
  IF c.order_id IS NULL THEN
    RAISE EXCEPTION 'No handover code for this order';
  END IF;
  IF c.failed_attempts >= 5 THEN
    RAISE EXCEPTION 'Too many incorrect codes. Contact support.';
  END IF;
  IF trim(COALESCE(p_code, '')) <> c.code THEN
    UPDATE public.order_handover_codes SET failed_attempts = failed_attempts + 1
    WHERE order_id = p_order_id AND kind = p_kind;
    RETURN false;
  END IF;
  UPDATE public.order_handover_codes SET used_at = now() WHERE order_id = p_order_id AND kind = p_kind;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_handover_code(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Vendor: hand the order to the rider, using the rider's pickup code.
-- Returns false if the code is wrong.
CREATE OR REPLACE FUNCTION public.vendor_confirm_pickup(p_order_id UUID, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'vendor');
BEGIN
  IF o.status NOT IN ('rider_assigned', 'picking_up') THEN
    RAISE EXCEPTION 'This order isn''t waiting for a rider to collect it';
  END IF;
  IF NOT public.check_handover_code(o.id, 'pickup', p_code) THEN
    RETURN false;
  END IF;
  UPDATE public.orders SET status = 'out_for_delivery', picked_up_at = now() WHERE id = o.id;
  UPDATE public.deliveries SET status = 'picked_up', picked_up_at = now() WHERE order_id = o.id;
  RETURN true;
END;
$$;

-- Rider: complete the delivery, using the customer's delivery code.
-- Returns false if the code is wrong. Settlement runs on 'delivered'.
CREATE OR REPLACE FUNCTION public.rider_confirm_delivery(p_order_id UUID, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE := public.order_for_action(p_order_id, 'rider');
BEGIN
  IF o.status <> 'out_for_delivery' THEN
    RAISE EXCEPTION 'This order isn''t out for delivery';
  END IF;
  IF NOT public.check_handover_code(o.id, 'delivery', p_code) THEN
    RETURN false;
  END IF;
  UPDATE public.orders SET status = 'delivered', delivered_at = now() WHERE id = o.id;
  UPDATE public.deliveries SET status = 'delivered', delivered_at = now() WHERE order_id = o.id;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vendor_accept_order(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vendor_mark_ready(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vendor_reject_order(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.customer_cancel_order(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rider_accept_order(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rider_start_pickup(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vendor_confirm_pickup(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rider_confirm_delivery(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_accept_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_mark_ready(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_reject_order(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_cancel_order(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_accept_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_start_pickup(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_confirm_pickup(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_confirm_delivery(UUID, TEXT) TO authenticated;

-- ===================================================================
-- 7. Who sees what
-- ===================================================================

-- Vendors only see orders once they're paid (or refunded after a rejection)
DROP POLICY IF EXISTS "Vendors can view their orders" ON public.orders;
CREATE POLICY "Vendors can view their orders" ON public.orders
  FOR SELECT USING (vendor_id = auth.uid() AND payment_status IN ('paid', 'refunded'));

-- Riders only see orders once the vendor marks them ready
DROP POLICY IF EXISTS "Riders can view available orders for pickup" ON public.orders;
CREATE POLICY "Riders can view available orders for pickup" ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'rider'
    AND payment_status = 'paid'
    AND status = 'ready_for_pickup'
    AND rider_id IS NULL
    AND delivery_type != 'pickup'
    AND public.order_pickup_within_rider_radius(id)
  );

-- Accepting now goes through rider_accept_order()
DROP POLICY IF EXISTS "Riders can accept available orders" ON public.orders;
DROP POLICY IF EXISTS "Riders can accept available deliveries" ON public.deliveries;

CREATE OR REPLACE FUNCTION public.shares_order_with(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE p_profile_id IN (o.customer_id, o.vendor_id, o.rider_id)
      AND (
        auth.uid() IN (o.customer_id, o.vendor_id, o.rider_id)
        OR (
          o.rider_id IS NULL
          AND o.payment_status = 'paid'
          AND o.status = 'ready_for_pickup'
          AND public.current_user_role() = 'rider'
          AND public.order_pickup_within_rider_radius(o.id)
        )
      )
  );
$$;

-- The delivery (and its pickup point) is created when the order is ready
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
  IF NEW.status = 'ready_for_pickup' AND OLD.status IS DISTINCT FROM 'ready_for_pickup'
     AND NEW.payment_status = 'paid'
     AND NEW.delivery_type != 'pickup'
     AND NOT EXISTS (SELECT 1 FROM public.deliveries WHERE order_id = NEW.id) THEN

    SELECT * INTO v_store
    FROM public.addresses
    WHERE profile_id = NEW.vendor_id
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1;

    SELECT COALESCE(rider_share_rate, 0.85) INTO v_rider_share
    FROM public.pricing_config ORDER BY created_at DESC LIMIT 1;

    INSERT INTO public.deliveries (
      order_id, status, estimated_pickup_time, estimated_delivery_time, delivery_fee, rider_earning,
      pickup_location, pickup_address_id, delivery_location, delivery_address_id
    ) VALUES (
      NEW.id, 'available', NOW() + INTERVAL '15 minutes', NOW() + INTERVAL '45 minutes',
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
