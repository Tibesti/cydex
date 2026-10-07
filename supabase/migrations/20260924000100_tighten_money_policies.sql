-- ===================================================================
-- Tighten wallet and payment access
-- Earlier migrations let anyone (including logged-out visitors) read and
-- change every wallet, payment hold, settlement and transaction, so the
-- settlement triggers could write them. Those triggers now run as
-- SECURITY DEFINER (20260924000000), so these rules only need to allow
-- what the app does from the browser:
--   - users create and update their own wallet (walletSetupService, payouts)
--   - a vendor refunding a paid order credits that order's customer
--     (settlementService.processRefund)
--   - admins manage everything
-- Remaining gap: users can still change their own wallet balance, because
-- the app updates balances from the browser. Closing that needs the money
-- logic moved to server-side code.
-- ===================================================================

-- True when the current user is the vendor on a paid order for p_customer_id
CREATE OR REPLACE FUNCTION public.is_vendor_of_paid_order_for(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.customer_id = p_customer_id
      AND o.vendor_id = auth.uid()
      AND o.payment_status = 'paid'
  );
$$;

-- ===================================================================
-- 1. REMOVE THE OPEN RULES
-- ===================================================================

DROP POLICY IF EXISTS "System can manage customer wallets" ON public.customer_wallet;
DROP POLICY IF EXISTS "System can manage vendor wallets" ON public.vendor_wallet;
DROP POLICY IF EXISTS "System can manage rider wallets" ON public.rider_wallet;
DROP POLICY IF EXISTS "System can manage payment holds" ON public.payment_holds;
DROP POLICY IF EXISTS "System can manage settlements" ON public.settlements;
DROP POLICY IF EXISTS "System can insert customer transactions" ON public.customer_transactions;
DROP POLICY IF EXISTS "System can insert vendor transactions" ON public.vendor_transactions;
DROP POLICY IF EXISTS "System can insert rider transactions" ON public.rider_transactions;
DROP POLICY IF EXISTS "System can insert rider earnings" ON public.rider_earnings;
DROP POLICY IF EXISTS "System can update rider earnings" ON public.rider_earnings;
DROP POLICY IF EXISTS "System can manage achievements" ON public.rider_achievements;
DROP POLICY IF EXISTS "System can update withdrawal requests" ON public.customer_withdrawal_requests;

-- ===================================================================
-- 2. WALLETS
-- (each table already lets its owner SELECT their own row)
-- ===================================================================

CREATE POLICY "Customers can create their own wallet" ON public.customer_wallet
  FOR INSERT WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Customers can update their own wallet" ON public.customer_wallet
  FOR UPDATE USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Vendors can view wallets of customers they are refunding" ON public.customer_wallet
  FOR SELECT TO authenticated USING (public.is_vendor_of_paid_order_for(customer_id));
CREATE POLICY "Vendors can credit refunds to their customers" ON public.customer_wallet
  FOR UPDATE TO authenticated
  USING (public.is_vendor_of_paid_order_for(customer_id))
  WITH CHECK (public.is_vendor_of_paid_order_for(customer_id));
CREATE POLICY "Vendors can create a wallet for a refund" ON public.customer_wallet
  FOR INSERT TO authenticated WITH CHECK (public.is_vendor_of_paid_order_for(customer_id));
CREATE POLICY "Admins can manage customer wallets" ON public.customer_wallet
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Vendors can create their own wallet" ON public.vendor_wallet
  FOR INSERT WITH CHECK (vendor_id = auth.uid());
CREATE POLICY "Vendors can update their own wallet" ON public.vendor_wallet
  FOR UPDATE USING (vendor_id = auth.uid()) WITH CHECK (vendor_id = auth.uid());
CREATE POLICY "Admins can manage vendor wallets" ON public.vendor_wallet
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Riders can create their own wallet" ON public.rider_wallet
  FOR INSERT WITH CHECK (rider_id = auth.uid());
CREATE POLICY "Riders can update their own wallet" ON public.rider_wallet
  FOR UPDATE USING (rider_id = auth.uid()) WITH CHECK (rider_id = auth.uid());
CREATE POLICY "Admins can manage rider wallets" ON public.rider_wallet
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===================================================================
-- 3. PAYMENT HOLDS
-- ===================================================================

CREATE POLICY "Order parties can view payment holds" ON public.payment_holds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_holds.order_id
        AND auth.uid() IN (o.customer_id, o.vendor_id, o.rider_id)
    )
  );
-- Vendors may only move a hold on their own order to 'refunded'
CREATE POLICY "Vendors can refund holds on their orders" ON public.payment_holds
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payment_holds.order_id AND o.vendor_id = auth.uid()))
  WITH CHECK (
    status = 'refunded'
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payment_holds.order_id AND o.vendor_id = auth.uid())
  );
CREATE POLICY "Admins can manage payment holds" ON public.payment_holds
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===================================================================
-- 4. TRANSACTIONS, SETTLEMENTS, EARNINGS
-- Written by the settlement trigger; users keep read access to their own.
-- ===================================================================

CREATE POLICY "Customers can record their own transactions" ON public.customer_transactions
  FOR INSERT WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Vendors can record refunds for their orders" ON public.customer_transactions
  FOR INSERT WITH CHECK (
    type = 'refund'
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = customer_transactions.reference_id
        AND o.vendor_id = auth.uid()
        AND o.customer_id = customer_transactions.customer_id
    )
  );
CREATE POLICY "Admins can manage customer transactions" ON public.customer_transactions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage rider transactions" ON public.rider_transactions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage settlements" ON public.settlements
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage rider earnings" ON public.rider_earnings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage rider achievements" ON public.rider_achievements
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ===================================================================
-- 5. CUSTOMER WITHDRAWALS
-- settlementService.requeryPayoutStatus updates the customer's own request.
-- ===================================================================

CREATE POLICY "Customers can update their own withdrawal requests" ON public.customer_withdrawal_requests
  FOR UPDATE USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Admins can manage withdrawal requests" ON public.customer_withdrawal_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
