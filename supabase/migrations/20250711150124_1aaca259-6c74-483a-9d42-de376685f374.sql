-- Create vendor bank accounts table
CREATE TABLE public.vendor_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    account_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create vendor transactions table  
CREATE TABLE public.vendor_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('sale', 'payout', 'refund', 'adjustment')),
    amount DECIMAL(12,2) NOT NULL,
    fee DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    description TEXT,
    reference_id UUID NULL, -- order_id, payout_request_id, etc
    reference_type TEXT NULL, -- 'order', 'payout_request', etc
    bank_account_id UUID NULL REFERENCES public.vendor_bank_accounts(id),
    metadata JSONB DEFAULT '{}',
    processed_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create payout requests table
CREATE TABLE public.vendor_payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES public.vendor_bank_accounts(id),
    amount DECIMAL(12,2) NOT NULL,
    fee DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    failure_reason TEXT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    processed_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create vendor recycling stats table
CREATE TABLE public.vendor_recycling_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    total_recycled_kg DECIMAL(10,2) DEFAULT 0,
    carbon_saved_kg DECIMAL(10,2) DEFAULT 0,
    customer_participation_rate DECIMAL(5,2) DEFAULT 0,
    vendor_recycling_rate DECIMAL(5,2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create recycling activities table
CREATE TABLE public.vendor_recycling_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    material_type TEXT NOT NULL,
    weight_kg DECIMAL(10,2) NOT NULL,
    points_earned INTEGER DEFAULT 0,
    partner_name TEXT NOT NULL,
    activity_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create recycling partners table
CREATE TABLE public.recycling_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    logo_url TEXT NULL,
    rating DECIMAL(2,1) DEFAULT 0,
    materials TEXT[] NOT NULL,
    contact_info JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create vendor settings table
CREATE TABLE public.vendor_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    business_license TEXT NULL,
    category TEXT NULL,
    description TEXT NULL,
    logo_url TEXT NULL,
    notification_preferences JSONB DEFAULT '{"email": true, "push": true, "sms": false, "marketing": false}',
    security_settings JSONB DEFAULT '{"two_factor_enabled": false, "session_timeout": 3600}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(vendor_id)
);

-- Enable RLS on all tables
ALTER TABLE public.vendor_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_recycling_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_recycling_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recycling_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vendor_bank_accounts
CREATE POLICY "Vendors can manage their own bank accounts" 
ON public.vendor_bank_accounts 
FOR ALL 
USING (vendor_id = auth.uid());

-- RLS Policies for vendor_transactions
CREATE POLICY "Vendors can view their own transactions" 
ON public.vendor_transactions 
FOR SELECT 
USING (vendor_id = auth.uid());

CREATE POLICY "System can insert vendor transactions" 
ON public.vendor_transactions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Admins can view all vendor transactions" 
ON public.vendor_transactions 
FOR ALL 
USING (is_admin());

-- RLS Policies for vendor_payout_requests
CREATE POLICY "Vendors can manage their own payout requests" 
ON public.vendor_payout_requests 
FOR ALL 
USING (vendor_id = auth.uid());

CREATE POLICY "Admins can view all payout requests" 
ON public.vendor_payout_requests 
FOR ALL 
USING (is_admin());

-- RLS Policies for vendor_recycling_stats
CREATE POLICY "Vendors can view their own recycling stats" 
ON public.vendor_recycling_stats 
FOR ALL 
USING (vendor_id = auth.uid());

-- RLS Policies for vendor_recycling_activities
CREATE POLICY "Vendors can manage their own recycling activities" 
ON public.vendor_recycling_activities 
FOR ALL 
USING (vendor_id = auth.uid());

-- RLS Policies for recycling_partners
CREATE POLICY "Everyone can view active recycling partners" 
ON public.recycling_partners 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage recycling partners" 
ON public.recycling_partners 
FOR ALL 
USING (is_admin());

-- RLS Policies for vendor_settings
CREATE POLICY "Vendors can manage their own settings" 
ON public.vendor_settings 
FOR ALL 
USING (vendor_id = auth.uid());

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vendor_bank_accounts_updated_at 
    BEFORE UPDATE ON public.vendor_bank_accounts 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendor_transactions_updated_at 
    BEFORE UPDATE ON public.vendor_transactions 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendor_payout_requests_updated_at 
    BEFORE UPDATE ON public.vendor_payout_requests 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recycling_partners_updated_at 
    BEFORE UPDATE ON public.recycling_partners 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendor_settings_updated_at 
    BEFORE UPDATE ON public.vendor_settings 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some sample recycling partners
INSERT INTO public.recycling_partners (name, logo_url, rating, materials, contact_info) VALUES
('EcoPack Solutions', null, 4.5, ARRAY['cardboard', 'paper'], '{"email": "contact@ecopack.ng", "phone": "+234 803 123 4567"}'),
('GreenCycle Ltd', null, 4.2, ARRAY['plastic', 'aluminum'], '{"email": "info@greencycle.ng", "phone": "+234 805 987 6543"}'),
('EnviroGlass Inc', null, 4.8, ARRAY['glass'], '{"email": "hello@enviroglass.ng", "phone": "+234 807 456 7890"}');

-- Create indexes for performance
CREATE INDEX idx_vendor_transactions_vendor_id ON public.vendor_transactions(vendor_id);
CREATE INDEX idx_vendor_transactions_type ON public.vendor_transactions(type);
CREATE INDEX idx_vendor_transactions_status ON public.vendor_transactions(status);
CREATE INDEX idx_vendor_transactions_created_at ON public.vendor_transactions(created_at);
CREATE INDEX idx_vendor_bank_accounts_vendor_id ON public.vendor_bank_accounts(vendor_id);
CREATE INDEX idx_vendor_payout_requests_vendor_id ON public.vendor_payout_requests(vendor_id);
CREATE INDEX idx_vendor_recycling_activities_vendor_id ON public.vendor_recycling_activities(vendor_id);