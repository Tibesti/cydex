-- ===================================================================
-- Customer saved addresses
-- Customers pick addresses with Google Places (search + map pin). One of
-- them is the default and is used for delivery; each order keeps its own
-- copy in orders.delivery_address.
-- ===================================================================

CREATE TABLE public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
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
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_addresses_customer_id ON public.customer_addresses (customer_id);
-- At most one default per customer
CREATE UNIQUE INDEX customer_addresses_one_default ON public.customer_addresses (customer_id) WHERE is_default;

CREATE TRIGGER update_customer_addresses_updated_at BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===================================================================
-- Exactly one default per customer:
--   - the first address saved becomes the default
--   - marking an address as default clears the previous one
--   - the default can't be switched off directly (pick another instead)
--   - deleting the default promotes the most recently added address
-- ===================================================================

CREATE OR REPLACE FUNCTION public.customer_addresses_keep_one_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND NOT EXISTS (SELECT 1 FROM public.customer_addresses WHERE customer_id = NEW.customer_id) THEN
    NEW.is_default := true;
  END IF;

  -- Direct attempts to unset the default are ignored; nested calls come from
  -- this trigger clearing the previous default.
  IF TG_OP = 'UPDATE' AND OLD.is_default AND NOT NEW.is_default AND pg_trigger_depth() = 1 THEN
    NEW.is_default := true;
  END IF;

  IF NEW.is_default AND (TG_OP = 'INSERT' OR NOT OLD.is_default) THEN
    UPDATE public.customer_addresses
    SET is_default = false
    WHERE customer_id = NEW.customer_id AND is_default AND id <> NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_addresses_keep_one_default
  BEFORE INSERT OR UPDATE OF is_default ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.customer_addresses_keep_one_default();

CREATE OR REPLACE FUNCTION public.customer_addresses_promote_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_default THEN
    UPDATE public.customer_addresses
    SET is_default = true
    WHERE id = (
      SELECT id FROM public.customer_addresses
      WHERE customer_id = OLD.customer_id
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER customer_addresses_promote_default
  AFTER DELETE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.customer_addresses_promote_default();

-- ===================================================================
-- Access
-- ===================================================================

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can manage their own addresses" ON public.customer_addresses
  FOR ALL USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Admins can view all customer addresses" ON public.customer_addresses
  FOR SELECT USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated, service_role;
