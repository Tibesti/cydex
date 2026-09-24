-- ===================================================================
-- Wallet & Payment Enhancement Migration
-- This migration creates the necessary tables and triggers for proper
-- wallet management, fund holding, and settlement for all user roles
-- ===================================================================

-- ===================================================================
-- 1. RIDER EARNINGS AND WALLET TABLES
-- ===================================================================

-- Create rider_earnings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.rider_earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    eco_bonus DECIMAL(12,2) NOT NULL DEFAULT 0,
    tip_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_earnings DECIMAL(12,2) NOT NULL DEFAULT 0,
    carbon_credits_earned DECIMAL(10,2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'held', 'released', 'paid_out')),
    earnings_date DATE NOT NULL DEFAULT CURRENT_DATE,
    released_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create rider_wallet table
CREATE TABLE IF NOT EXISTS public.rider_wallet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    available_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    pending_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_earned DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_withdrawn DECIMAL(12,2) NOT NULL DEFAULT 0,
    carbon_credits DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create rider_transactions table
CREATE TABLE IF NOT EXISTS public.rider_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('earning', 'withdrawal', 'bonus', 'adjustment', 'refund')),
    amount DECIMAL(12,2) NOT NULL,
    fee DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    description TEXT,
    reference_id UUID NULL,
    reference_type TEXT NULL,
    bank_account_id UUID NULL REFERENCES public.rider_bank_details(id),
    metadata JSONB DEFAULT '{}',
    processed_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create rider_payout_requests table
CREATE TABLE IF NOT EXISTS public.rider_payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES public.rider_bank_details(id),
    amount DECIMAL(12,2) NOT NULL,
    fee DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    failure_reason TEXT NULL,
    paystack_reference TEXT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    processed_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ===================================================================
-- 2. CUSTOMER WALLET TABLES
-- ===================================================================

-- Create customer_wallet table
CREATE TABLE IF NOT EXISTS public.customer_wallet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    available_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    bonus_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    carbon_credits DECIMAL(10,2) DEFAULT 0,
    total_spent DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create customer_transactions table
CREATE TABLE IF NOT EXISTS public.customer_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('payment', 'refund', 'bonus', 'reward', 'adjustment')),
    amount DECIMAL(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    description TEXT,
    reference_id UUID NULL,
    reference_type TEXT NULL,
    payment_method TEXT,
    metadata JSONB DEFAULT '{}',
    processed_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ===================================================================
-- 3. PAYMENT ESCROW AND SETTLEMENT TRACKING
-- ===================================================================

-- Create payment_holds table to track funds in escrow
CREATE TABLE IF NOT EXISTS public.payment_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    payment_reference TEXT NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    vendor_amount DECIMAL(12,2) NOT NULL,
    rider_amount DECIMAL(12,2) NOT NULL,
    platform_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'partial_release', 'released', 'refunded')),
    vendor_released_at TIMESTAMP WITH TIME ZONE,
    rider_released_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create settlements table to track all settlements
CREATE TABLE IF NOT EXISTS public.settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_type TEXT NOT NULL CHECK (recipient_type IN ('vendor', 'rider')),
    amount DECIMAL(12,2) NOT NULL,
    fee DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    payment_reference TEXT,
    paystack_transfer_code TEXT,
    settled_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ===================================================================
-- 4. VENDOR WALLET TABLE (add missing column)
-- ===================================================================

-- Create vendor_wallet table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.vendor_wallet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    available_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    pending_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_earned DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_withdrawn DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ===================================================================
-- 5. ENABLE ROW LEVEL SECURITY
-- ===================================================================

ALTER TABLE public.rider_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_wallet ENABLE ROW LEVEL SECURITY;

-- ===================================================================
-- 6. CREATE RLS POLICIES
-- ===================================================================

-- Rider Earnings Policies
CREATE POLICY "Riders can view their own earnings" 
ON public.rider_earnings FOR SELECT 
USING (rider_id = auth.uid());

CREATE POLICY "System can insert rider earnings" 
ON public.rider_earnings FOR INSERT 
WITH CHECK (true);

CREATE POLICY "System can update rider earnings" 
ON public.rider_earnings FOR UPDATE 
USING (true);

-- Rider Wallet Policies
CREATE POLICY "Riders can view their own wallet" 
ON public.rider_wallet FOR SELECT 
USING (rider_id = auth.uid());

CREATE POLICY "System can manage rider wallets" 
ON public.rider_wallet FOR ALL 
USING (true);

-- Rider Transactions Policies
CREATE POLICY "Riders can view their own transactions" 
ON public.rider_transactions FOR SELECT 
USING (rider_id = auth.uid());

CREATE POLICY "System can insert rider transactions" 
ON public.rider_transactions FOR INSERT 
WITH CHECK (true);

-- Rider Payout Requests Policies
CREATE POLICY "Riders can manage their own payout requests" 
ON public.rider_payout_requests FOR ALL 
USING (rider_id = auth.uid());

-- Customer Wallet Policies
CREATE POLICY "Customers can view their own wallet" 
ON public.customer_wallet FOR SELECT 
USING (customer_id = auth.uid());

CREATE POLICY "System can manage customer wallets" 
ON public.customer_wallet FOR ALL 
USING (true);

-- Customer Transactions Policies
CREATE POLICY "Customers can view their own transactions" 
ON public.customer_transactions FOR SELECT 
USING (customer_id = auth.uid());

CREATE POLICY "System can insert customer transactions" 
ON public.customer_transactions FOR INSERT 
WITH CHECK (true);

-- Payment Holds Policies (admin and system only)
CREATE POLICY "Admins can view all payment holds" 
ON public.payment_holds FOR SELECT 
USING (is_admin());

CREATE POLICY "System can manage payment holds" 
ON public.payment_holds FOR ALL 
USING (true);

-- Settlements Policies
CREATE POLICY "Recipients can view their own settlements" 
ON public.settlements FOR SELECT 
USING (recipient_id = auth.uid());

CREATE POLICY "System can manage settlements" 
ON public.settlements FOR ALL 
USING (true);

-- Vendor Wallet Policies
CREATE POLICY "Vendors can view their own wallet" 
ON public.vendor_wallet FOR SELECT 
USING (vendor_id = auth.uid());

CREATE POLICY "System can manage vendor wallets" 
ON public.vendor_wallet FOR ALL 
USING (true);

-- ===================================================================
-- 7. CREATE INDEXES FOR PERFORMANCE
-- ===================================================================

CREATE INDEX IF NOT EXISTS idx_rider_earnings_rider_id ON public.rider_earnings(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_status ON public.rider_earnings(status);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_date ON public.rider_earnings(earnings_date);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_order_id ON public.rider_earnings(order_id);

CREATE INDEX IF NOT EXISTS idx_rider_transactions_rider_id ON public.rider_transactions(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_transactions_status ON public.rider_transactions(status);
CREATE INDEX IF NOT EXISTS idx_rider_transactions_type ON public.rider_transactions(type);

CREATE INDEX IF NOT EXISTS idx_rider_payout_requests_rider_id ON public.rider_payout_requests(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_payout_requests_status ON public.rider_payout_requests(status);

CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer_id ON public.customer_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_status ON public.customer_transactions(status);

CREATE INDEX IF NOT EXISTS idx_payment_holds_order_id ON public.payment_holds(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_holds_status ON public.payment_holds(status);

CREATE INDEX IF NOT EXISTS idx_settlements_order_id ON public.settlements(order_id);
CREATE INDEX IF NOT EXISTS idx_settlements_recipient_id ON public.settlements(recipient_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON public.settlements(status);

-- ===================================================================
-- 8. CREATE TRIGGERS FOR updated_at
-- ===================================================================

CREATE TRIGGER update_rider_earnings_updated_at 
    BEFORE UPDATE ON public.rider_earnings 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rider_wallet_updated_at 
    BEFORE UPDATE ON public.rider_wallet 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rider_transactions_updated_at 
    BEFORE UPDATE ON public.rider_transactions 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rider_payout_requests_updated_at 
    BEFORE UPDATE ON public.rider_payout_requests 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customer_wallet_updated_at 
    BEFORE UPDATE ON public.customer_wallet 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customer_transactions_updated_at 
    BEFORE UPDATE ON public.customer_transactions 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_holds_updated_at 
    BEFORE UPDATE ON public.payment_holds 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settlements_updated_at 
    BEFORE UPDATE ON public.settlements 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendor_wallet_updated_at 
    BEFORE UPDATE ON public.vendor_wallet 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===================================================================
-- 9. CREATE SETTLEMENT FUNCTIONS
-- ===================================================================

-- Function to calculate settlement amounts
CREATE OR REPLACE FUNCTION calculate_settlement_amounts(
    p_order_id UUID,
    OUT vendor_amount DECIMAL(12,2),
    OUT rider_amount DECIMAL(12,2),
    OUT platform_fee DECIMAL(12,2)
) AS $$
DECLARE
    v_subtotal DECIMAL(12,2);
    v_delivery_fee DECIMAL(12,2);
    v_total DECIMAL(12,2);
BEGIN
    -- Get order details
    SELECT 
        subtotal,
        delivery_fee,
        total_amount
    INTO v_subtotal, v_delivery_fee, v_total
    FROM orders
    WHERE id = p_order_id;
    
    -- Platform takes 10% from vendor sales
    platform_fee := v_subtotal * 0.10;
    vendor_amount := v_subtotal - platform_fee;
    
    -- Rider gets full delivery fee
    rider_amount := v_delivery_fee;
END;
$$ LANGUAGE plpgsql;

-- Function to create payment hold when order is paid
CREATE OR REPLACE FUNCTION create_payment_hold()
RETURNS TRIGGER AS $$
DECLARE
    v_vendor_amount DECIMAL(12,2);
    v_rider_amount DECIMAL(12,2);
    v_platform_fee DECIMAL(12,2);
BEGIN
    -- Only create hold when payment status changes to paid
    IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
        -- Calculate settlement amounts
        SELECT * INTO v_vendor_amount, v_rider_amount, v_platform_fee
        FROM calculate_settlement_amounts(NEW.id);
        
        -- Create payment hold record
        INSERT INTO payment_holds (
            order_id,
            payment_reference,
            total_amount,
            vendor_amount,
            rider_amount,
            platform_fee,
            status,
            metadata
        ) VALUES (
            NEW.id,
            NEW.payment_reference,
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
        );
        
        RAISE NOTICE 'Payment hold created for order %: Vendor=%, Rider=%, Platform=%',
            NEW.id, v_vendor_amount, v_rider_amount, v_platform_fee;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to process settlement when order is delivered
CREATE OR REPLACE FUNCTION process_order_settlement()
RETURNS TRIGGER AS $$
DECLARE
    v_payment_hold RECORD;
    v_vendor_transaction_id TEXT;
    v_rider_transaction_id TEXT;
    v_eco_bonus DECIMAL(12,2);
BEGIN
    -- Only process settlement when order status changes to delivered
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
        -- Get payment hold information
        SELECT * INTO v_payment_hold
        FROM payment_holds
        WHERE order_id = NEW.id AND status = 'held';
        
        IF v_payment_hold.id IS NULL THEN
            RAISE WARNING 'No payment hold found for delivered order %', NEW.id;
            RETURN NEW;
        END IF;
        
        -- Generate transaction IDs
        v_vendor_transaction_id := 'VTX-' || NEW.order_number || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT;
        v_rider_transaction_id := 'RTX-' || NEW.order_number || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT;
        
        -- Calculate eco bonus for rider (5% of delivery fee)
        v_eco_bonus := v_payment_hold.rider_amount * 0.05;
        
        -- Create vendor settlement
        INSERT INTO settlements (
            order_id,
            recipient_id,
            recipient_type,
            amount,
            fee,
            net_amount,
            status,
            payment_reference,
            metadata
        ) VALUES (
            NEW.id,
            NEW.vendor_id,
            'vendor',
            v_payment_hold.vendor_amount,
            0,
            v_payment_hold.vendor_amount,
            'completed',
            v_payment_hold.payment_reference,
            jsonb_build_object('order_number', NEW.order_number)
        );
        
        -- Create vendor transaction
        INSERT INTO vendor_transactions (
            vendor_id,
            transaction_id,
            type,
            amount,
            fee,
            net_amount,
            status,
            description,
            reference_id,
            reference_type,
            processed_at,
            metadata
        ) VALUES (
            NEW.vendor_id,
            v_vendor_transaction_id,
            'sale',
            v_payment_hold.vendor_amount,
            v_payment_hold.platform_fee,
            v_payment_hold.vendor_amount,
            'completed',
            'Order ' || NEW.order_number || ' sale',
            NEW.id,
            'order',
            NOW(),
            jsonb_build_object(
                'order_number', NEW.order_number,
                'settlement_id', currval('settlements_id_seq')
            )
        );
        
        -- Update vendor wallet
        INSERT INTO vendor_wallet (vendor_id, available_balance, total_earned)
        VALUES (NEW.vendor_id, v_payment_hold.vendor_amount, v_payment_hold.vendor_amount)
        ON CONFLICT (vendor_id) DO UPDATE
        SET 
            available_balance = vendor_wallet.available_balance + v_payment_hold.vendor_amount,
            total_earned = vendor_wallet.total_earned + v_payment_hold.vendor_amount,
            updated_at = NOW();
        
        -- Create rider settlement (if rider assigned)
        IF NEW.rider_id IS NOT NULL THEN
            INSERT INTO settlements (
                order_id,
                recipient_id,
                recipient_type,
                amount,
                fee,
                net_amount,
                status,
                payment_reference,
                metadata
            ) VALUES (
                NEW.id,
                NEW.rider_id,
                'rider',
                v_payment_hold.rider_amount + v_eco_bonus,
                0,
                v_payment_hold.rider_amount + v_eco_bonus,
                'completed',
                v_payment_hold.payment_reference,
                jsonb_build_object(
                    'order_number', NEW.order_number,
                    'eco_bonus', v_eco_bonus
                )
            );
            
            -- Create rider earnings record
            INSERT INTO rider_earnings (
                rider_id,
                delivery_id,
                order_id,
                delivery_fee,
                eco_bonus,
                tip_amount,
                total_earnings,
                status,
                earnings_date,
                released_at
            ) VALUES (
                NEW.rider_id,
                (SELECT id FROM deliveries WHERE order_id = NEW.id LIMIT 1),
                NEW.id,
                v_payment_hold.rider_amount,
                v_eco_bonus,
                0,
                v_payment_hold.rider_amount + v_eco_bonus,
                'released',
                CURRENT_DATE,
                NOW()
            );
            
            -- Create rider transaction
            INSERT INTO rider_transactions (
                rider_id,
                transaction_id,
                type,
                amount,
                fee,
                net_amount,
                status,
                description,
                reference_id,
                reference_type,
                processed_at,
                metadata
            ) VALUES (
                NEW.rider_id,
                v_rider_transaction_id,
                'earning',
                v_payment_hold.rider_amount + v_eco_bonus,
                0,
                v_payment_hold.rider_amount + v_eco_bonus,
                'completed',
                'Delivery for order ' || NEW.order_number,
                NEW.id,
                'order',
                NOW(),
                jsonb_build_object(
                    'order_number', NEW.order_number,
                    'delivery_fee', v_payment_hold.rider_amount,
                    'eco_bonus', v_eco_bonus
                )
            );
            
            -- Update rider wallet
            INSERT INTO rider_wallet (rider_id, available_balance, total_earned)
            VALUES (NEW.rider_id, v_payment_hold.rider_amount + v_eco_bonus, v_payment_hold.rider_amount + v_eco_bonus)
            ON CONFLICT (rider_id) DO UPDATE
            SET 
                available_balance = rider_wallet.available_balance + v_payment_hold.rider_amount + v_eco_bonus,
                total_earned = rider_wallet.total_earned + v_payment_hold.rider_amount + v_eco_bonus,
                updated_at = NOW();
        END IF;
        
        -- Update payment hold status
        UPDATE payment_holds
        SET 
            status = 'released',
            vendor_released_at = NOW(),
            rider_released_at = CASE WHEN NEW.rider_id IS NOT NULL THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = v_payment_hold.id;
        
        RAISE NOTICE 'Settlement processed for order %: Vendor=%, Rider=%',
            NEW.order_number, v_payment_hold.vendor_amount, v_payment_hold.rider_amount + v_eco_bonus;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===================================================================
-- 10. CREATE TRIGGERS FOR SETTLEMENT AUTOMATION
-- ===================================================================

-- Trigger to create payment hold when order is paid
DROP TRIGGER IF EXISTS create_payment_hold_trigger ON public.orders;
CREATE TRIGGER create_payment_hold_trigger
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION create_payment_hold();

-- Trigger to process settlement when order is delivered
DROP TRIGGER IF EXISTS process_order_settlement_trigger ON public.orders;
CREATE TRIGGER process_order_settlement_trigger
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION process_order_settlement();

-- ===================================================================
-- 11. HELPER FUNCTIONS
-- ===================================================================

-- Function to get wallet balance
CREATE OR REPLACE FUNCTION get_wallet_balance(
    p_user_id UUID,
    p_user_role TEXT
) RETURNS TABLE (
    available_balance DECIMAL(12,2),
    pending_balance DECIMAL(12,2),
    total_earned DECIMAL(12,2)
) AS $$
BEGIN
    IF p_user_role = 'vendor' THEN
        RETURN QUERY
        SELECT 
            vw.available_balance,
            vw.pending_balance,
            vw.total_earned
        FROM vendor_wallet vw
        WHERE vw.vendor_id = p_user_id;
    ELSIF p_user_role = 'rider' THEN
        RETURN QUERY
        SELECT 
            rw.available_balance,
            rw.pending_balance,
            rw.total_earned
        FROM rider_wallet rw
        WHERE rw.rider_id = p_user_id;
    ELSIF p_user_role = 'customer' THEN
        RETURN QUERY
        SELECT 
            cw.available_balance,
            0::DECIMAL(12,2) as pending_balance,
            cw.total_spent as total_earned
        FROM customer_wallet cw
        WHERE cw.customer_id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ===================================================================
-- MIGRATION COMPLETE
-- ===================================================================

