-- ===================================================================
-- Base schema
-- Recreates the tables, functions and policies that existed before the
-- oldest migration in this folder (the original project was set up
-- outside of migrations). Rebuilt from src/integrations/supabase/types.ts
-- and from how the app code reads and writes each table.
-- Columns added by later migrations are intentionally left out here.
-- ===================================================================

-- ===================================================================
-- 1. ENUMS
-- ===================================================================

CREATE TYPE public.delivery_status AS ENUM (
  'available', 'accepted', 'picking_up', 'picked_up', 'delivering', 'delivered', 'cancelled'
);

CREATE TYPE public.rider_status AS ENUM ('offline', 'available', 'busy', 'break');

-- ===================================================================
-- 2. GENERIC HELPERS
-- ===================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Human-readable order number, e.g. ORD-20260924-4F1A9C
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));
$$;

-- ===================================================================
-- 3. TABLES
-- ===================================================================

-- One row per auth user; created by the handle_new_user trigger below.
-- Roles are stored lowercase: customer | vendor | rider | admin.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer'
    CHECK (lower(role) IN ('customer', 'vendor', 'rider', 'admin')),
  phone TEXT,
  address JSONB,
  avatar TEXT,
  gender TEXT,
  date_of_birth DATE,
  carbon_credits NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'active',
  verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMPTZ,
  mfa_enabled BOOLEAN DEFAULT false,
  login_count INTEGER DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  last_active TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_profiles_role ON public.profiles (role);

CREATE TABLE public.rider_profiles (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_type TEXT,
  license_number TEXT,
  vehicle_registration TEXT,
  rider_status public.rider_status DEFAULT 'offline',
  is_verified BOOLEAN DEFAULT false,
  rating NUMERIC(3,2) DEFAULT 0,
  total_deliveries INTEGER DEFAULT 0,
  current_location JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  category TEXT,
  image_url TEXT,
  stock_quantity INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'out_of_stock')),
  is_eco_friendly BOOLEAN DEFAULT false,
  carbon_impact NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_products_vendor_id ON public.products (vendor_id);
CREATE INDEX idx_products_status ON public.products (status);

-- Statuses used by the app: pending, accepted, processing, ready,
-- ready_for_pickup, rider_assigned, out_for_delivery, delivered, cancelled
-- (kept as free text).
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE DEFAULT public.generate_order_number(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  payment_reference TEXT,
  delivery_type TEXT NOT NULL DEFAULT 'standard',
  delivery_address JSONB NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  delivery_fee NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL,
  carbon_credits_earned NUMERIC(10,2) DEFAULT 0,
  special_instructions TEXT,
  time_slot TEXT,
  estimated_delivery_time TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_customer_id ON public.orders (customer_id);
CREATE INDEX idx_orders_vendor_id ON public.orders (vendor_id);
CREATE INDEX idx_orders_rider_id ON public.orders (rider_id);
CREATE INDEX idx_orders_status ON public.orders (status);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_description TEXT,
  product_category TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL,
  total_price NUMERIC(12,2) NOT NULL,
  is_eco_friendly BOOLEAN DEFAULT false,
  carbon_impact NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order_id ON public.order_items (order_id);

CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.delivery_status DEFAULT 'available',
  pickup_location JSONB,
  delivery_location JSONB,
  estimated_pickup_time TIMESTAMPTZ,
  estimated_delivery_time TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  delivery_fee NUMERIC(12,2) DEFAULT 0,
  tip_amount NUMERIC(12,2) DEFAULT 0,
  eco_bonus NUMERIC(12,2) DEFAULT 0,
  carbon_saved NUMERIC(10,2) DEFAULT 0,
  actual_distance NUMERIC(10,2),
  special_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_deliveries_order_id ON public.deliveries (order_id);
CREATE INDEX idx_deliveries_rider_id ON public.deliveries (rider_id);
CREATE INDEX idx_deliveries_status ON public.deliveries (status);

-- user_id NULL = broadcast to everyone
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_id ON public.notifications (user_id);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.vendor_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  delivery_rating INTEGER CHECK (delivery_rating BETWEEN 1 AND 5),
  product_quality_rating INTEGER CHECK (product_quality_rating BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (order_id, customer_id)
);

CREATE INDEX idx_vendor_ratings_vendor_id ON public.vendor_ratings (vendor_id);

CREATE TABLE public.vendor_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_orders INTEGER DEFAULT 0,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  total_carbon_saved NUMERIC(10,2) DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT 0,
  recycling_rate NUMERIC(5,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.customer_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  activity_description TEXT NOT NULL,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.customer_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivery_preferences JSONB DEFAULT '{}',
  notification_preferences JSONB DEFAULT '{}',
  privacy_settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.rider_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  total_deliveries INTEGER DEFAULT 0,
  total_earnings NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Written by the payment webhook handlers (src/services/*WebhookHandler.ts)
CREATE TABLE public.payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT,
  amount NUMERIC(12,2),
  email TEXT,
  order_number TEXT,
  customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  transaction_id TEXT,
  status TEXT NOT NULL,
  gateway TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================================================================
-- 4. updated_at TRIGGERS
-- ===================================================================

CREATE TRIGGER update_rider_profiles_updated_at BEFORE UPDATE ON public.rider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vendor_ratings_updated_at BEFORE UPDATE ON public.vendor_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vendor_stats_updated_at BEFORE UPDATE ON public.vendor_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customer_preferences_updated_at BEFORE UPDATE ON public.customer_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rider_schedules_updated_at BEFORE UPDATE ON public.rider_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===================================================================
-- 5. ROLE HELPERS (SECURITY DEFINER so policies can use them without
--    recursing into the profiles policies)
-- ===================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(role) FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'admin', false);
$$;

-- True when the current user and p_profile_id are on the same order, or the
-- current user is a rider and p_profile_id is on an order waiting for a rider.
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
          AND o.status IN ('accepted', 'processing', 'ready', 'ready_for_pickup')
          AND public.current_user_role() = 'rider'
        )
      )
  );
$$;

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
  WHERE vendor_id = vendor_uuid;
$$;

-- ===================================================================
-- 6. SIGN-UP: create a profile for every new auth user
-- The app's signUp() sends { name, role } as user metadata.
-- Admin can never be self-assigned; promote admins from the SQL editor.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := lower(COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer'));
BEGIN
  IF v_role NOT IN ('customer', 'vendor', 'rider') THEN
    v_role := 'customer';
  END IF;

  INSERT INTO public.profiles (id, email, name, role, email_verified_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'name', ''), split_part(NEW.email, '@', 1)),
    v_role,
    NEW.email_confirmed_at
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Users may edit their own profile but not their role, status or verified
-- flag. Requests without a user (SQL editor, service role) are not limited.
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.verified IS DISTINCT FROM OLD.verified THEN
      RAISE EXCEPTION 'Only admins can change role, status or verification';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profile_fields_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- ===================================================================
-- 7. ROW LEVEL SECURITY
-- (rider_profiles own-row policies come from 20250614171424)
-- ===================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can view profiles they share an order with" ON public.profiles
  FOR SELECT TO authenticated USING (public.shares_order_with(id));
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- rider_profiles
CREATE POLICY "Admins can manage rider profiles" ON public.rider_profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- products: public catalogue, vendors manage their own
CREATE POLICY "Anyone can view products" ON public.products
  FOR SELECT USING (true);
CREATE POLICY "Vendors can create their own products" ON public.products
  FOR INSERT WITH CHECK (vendor_id = auth.uid());
CREATE POLICY "Vendors can update their own products" ON public.products
  FOR UPDATE USING (vendor_id = auth.uid()) WITH CHECK (vendor_id = auth.uid());
CREATE POLICY "Vendors can delete their own products" ON public.products
  FOR DELETE USING (vendor_id = auth.uid());
CREATE POLICY "Admins can manage all products" ON public.products
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- orders
CREATE POLICY "Customers can view their own orders" ON public.orders
  FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "Vendors can view their orders" ON public.orders
  FOR SELECT USING (vendor_id = auth.uid());
CREATE POLICY "Riders can view their assigned orders" ON public.orders
  FOR SELECT USING (rider_id = auth.uid());
CREATE POLICY "Customers can create orders" ON public.orders
  FOR INSERT WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Customers can update their own orders" ON public.orders
  FOR UPDATE USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Vendors can update their orders" ON public.orders
  FOR UPDATE USING (vendor_id = auth.uid()) WITH CHECK (vendor_id = auth.uid());
CREATE POLICY "Riders can update their assigned orders" ON public.orders
  FOR UPDATE USING (rider_id = auth.uid()) WITH CHECK (rider_id = auth.uid());
CREATE POLICY "Riders can accept available orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (
    rider_id IS NULL
    AND payment_status = 'paid'
    AND status IN ('accepted', 'processing', 'ready', 'ready_for_pickup')
    AND public.current_user_role() = 'rider'
  )
  WITH CHECK (rider_id = auth.uid());
CREATE POLICY "Admins can manage all orders" ON public.orders
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- order_items: visible to whoever can see the order
CREATE POLICY "Users can view items of orders they can see" ON public.order_items
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id));
CREATE POLICY "Customers can add items to their own orders" ON public.order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.customer_id = auth.uid())
  );
CREATE POLICY "Admins can manage all order items" ON public.order_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- deliveries
CREATE POLICY "Riders can view their deliveries" ON public.deliveries
  FOR SELECT USING (rider_id = auth.uid());
CREATE POLICY "Riders can view available deliveries" ON public.deliveries
  FOR SELECT TO authenticated
  USING (status = 'available' AND rider_id IS NULL AND public.current_user_role() = 'rider');
CREATE POLICY "Customers and vendors can view deliveries for their orders" ON public.deliveries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = deliveries.order_id
        AND auth.uid() IN (o.customer_id, o.vendor_id)
    )
  );
CREATE POLICY "Riders can update their deliveries" ON public.deliveries
  FOR UPDATE USING (rider_id = auth.uid()) WITH CHECK (rider_id = auth.uid());
CREATE POLICY "Riders can accept available deliveries" ON public.deliveries
  FOR UPDATE TO authenticated
  USING (status = 'available' AND rider_id IS NULL AND public.current_user_role() = 'rider')
  WITH CHECK (rider_id = auth.uid());
CREATE POLICY "Admins can manage all deliveries" ON public.deliveries
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- notifications
CREATE POLICY "Users can view their notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "Users can update their notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete their notifications" ON public.notifications
  FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all notifications" ON public.notifications
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- audit_logs
CREATE POLICY "Admins can manage audit logs" ON public.audit_logs
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- vendor_ratings: public reviews, customers rate their own orders
CREATE POLICY "Anyone can view vendor ratings" ON public.vendor_ratings
  FOR SELECT USING (true);
CREATE POLICY "Customers can rate their own orders" ON public.vendor_ratings
  FOR INSERT WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = vendor_ratings.order_id AND o.customer_id = auth.uid())
  );
CREATE POLICY "Customers can update their own ratings" ON public.vendor_ratings
  FOR UPDATE USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Admins can manage all vendor ratings" ON public.vendor_ratings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- vendor_stats
CREATE POLICY "Vendors can manage their own stats" ON public.vendor_stats
  FOR ALL USING (vendor_id = auth.uid()) WITH CHECK (vendor_id = auth.uid());
CREATE POLICY "Admins can manage all vendor stats" ON public.vendor_stats
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- customer_activity
CREATE POLICY "Users can view their own activity" ON public.customer_activity
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can log their own activity" ON public.customer_activity
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all activity" ON public.customer_activity
  FOR SELECT USING (public.is_admin());

-- customer_preferences
CREATE POLICY "Users can manage their own preferences" ON public.customer_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- rider_schedules
CREATE POLICY "Riders can manage their own schedules" ON public.rider_schedules
  FOR ALL USING (rider_id = auth.uid()) WITH CHECK (rider_id = auth.uid());
CREATE POLICY "Admins can view all rider schedules" ON public.rider_schedules
  FOR SELECT USING (public.is_admin());

-- payment_logs
CREATE POLICY "Users can log their own payment events" ON public.payment_logs
  FOR INSERT TO authenticated WITH CHECK (customer_id IS NULL OR customer_id = auth.uid());
CREATE POLICY "Admins can view payment logs" ON public.payment_logs
  FOR SELECT USING (public.is_admin());
