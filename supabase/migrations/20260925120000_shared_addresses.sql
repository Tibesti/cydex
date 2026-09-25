-- ===================================================================
-- One addresses table for every role
--   customers: any number of saved addresses, exactly one default
--   vendors:   one address (their store, used as the pickup location)
--   riders:    one address
-- Orders and deliveries keep a copy of the address (JSON) plus a link to
-- the saved address it came from.
-- ===================================================================

-- ===================================================================
-- 1. customer_addresses -> addresses, customer_id -> profile_id
-- ===================================================================

DROP TRIGGER customer_addresses_keep_one_default ON public.customer_addresses;
DROP TRIGGER customer_addresses_promote_default ON public.customer_addresses;
DROP FUNCTION public.customer_addresses_keep_one_default();
DROP FUNCTION public.customer_addresses_promote_default();
DROP POLICY "Customers can manage their own addresses" ON public.customer_addresses;
DROP POLICY "Admins can view all customer addresses" ON public.customer_addresses;

ALTER TABLE public.customer_addresses RENAME TO addresses;
ALTER TABLE public.addresses RENAME COLUMN customer_id TO profile_id;
ALTER TABLE public.addresses RENAME CONSTRAINT customer_addresses_pkey TO addresses_pkey;
ALTER TABLE public.addresses RENAME CONSTRAINT customer_addresses_customer_id_fkey TO addresses_profile_id_fkey;
ALTER TABLE public.addresses RENAME CONSTRAINT customer_addresses_latitude_check TO addresses_latitude_check;
ALTER TABLE public.addresses RENAME CONSTRAINT customer_addresses_longitude_check TO addresses_longitude_check;
ALTER INDEX public.idx_customer_addresses_customer_id RENAME TO idx_addresses_profile_id;
ALTER INDEX public.customer_addresses_one_default RENAME TO addresses_one_default;
ALTER TRIGGER update_customer_addresses_updated_at ON public.addresses RENAME TO update_addresses_updated_at;

-- ===================================================================
-- 2. Rules
-- ===================================================================

-- Exactly one default per profile (same behaviour as before):
--   - the first address saved becomes the default
--   - marking an address as default clears the previous one
--   - the default can't be switched off directly (pick another instead)
CREATE OR REPLACE FUNCTION public.addresses_keep_one_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND NOT EXISTS (SELECT 1 FROM public.addresses WHERE profile_id = NEW.profile_id) THEN
    NEW.is_default := true;
  END IF;

  -- Nested calls come from this trigger clearing the previous default
  IF TG_OP = 'UPDATE' AND OLD.is_default AND NOT NEW.is_default AND pg_trigger_depth() = 1 THEN
    NEW.is_default := true;
  END IF;

  IF NEW.is_default AND (TG_OP = 'INSERT' OR NOT OLD.is_default) THEN
    UPDATE public.addresses
    SET is_default = false
    WHERE profile_id = NEW.profile_id AND is_default AND id <> NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER addresses_keep_one_default
  BEFORE INSERT OR UPDATE OF is_default ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.addresses_keep_one_default();

-- Deleting the default promotes the most recently added address
CREATE OR REPLACE FUNCTION public.addresses_promote_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_default THEN
    UPDATE public.addresses
    SET is_default = true
    WHERE id = (
      SELECT id FROM public.addresses
      WHERE profile_id = OLD.profile_id
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER addresses_promote_default
  AFTER DELETE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.addresses_promote_default();

-- Vendors (store location) and riders have a single address
CREATE OR REPLACE FUNCTION public.addresses_one_per_vendor_or_rider()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT lower(role) FROM public.profiles WHERE id = NEW.profile_id) IN ('vendor', 'rider')
     AND EXISTS (SELECT 1 FROM public.addresses WHERE profile_id = NEW.profile_id) THEN
    RAISE EXCEPTION 'Vendors and riders can only have one address. Update the existing one instead.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER addresses_one_per_vendor_or_rider
  BEFORE INSERT ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.addresses_one_per_vendor_or_rider();

-- ===================================================================
-- 3. Access
-- ===================================================================

CREATE POLICY "Users can manage their own addresses" ON public.addresses
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Admins can view all addresses" ON public.addresses
  FOR SELECT USING (public.is_admin());

-- ===================================================================
-- 4. Link orders and deliveries to the saved address they came from
-- (the JSON copy stays: it's what the order was actually delivered to)
-- ===================================================================

ALTER TABLE public.orders
  ADD COLUMN delivery_address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL;
ALTER TABLE public.deliveries
  ADD COLUMN delivery_address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL,
  ADD COLUMN pickup_address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL;

CREATE INDEX idx_orders_delivery_address_id ON public.orders (delivery_address_id);
CREATE INDEX idx_deliveries_delivery_address_id ON public.deliveries (delivery_address_id);
CREATE INDEX idx_deliveries_pickup_address_id ON public.deliveries (pickup_address_id);

-- Orders placed since saved addresses launched carry the id in their JSON
UPDATE public.orders o
SET delivery_address_id = a.id
FROM public.addresses a
WHERE o.delivery_address_id IS NULL
  AND a.id::text = o.delivery_address ->> 'address_id';

UPDATE public.deliveries d
SET delivery_address_id = o.delivery_address_id
FROM public.orders o
WHERE o.id = d.order_id
  AND d.delivery_address_id IS NULL
  AND o.delivery_address_id IS NOT NULL;

-- ===================================================================
-- 5. Pickup = the vendor's store address
-- ===================================================================

-- JSON copy of an address; same keys as toAddressSnapshot() in src/lib/address.ts
CREATE OR REPLACE FUNCTION public.address_snapshot(a public.addresses)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'address_id', a.id,
    'label', a.label,
    'address', a.formatted_address,
    'formatted_address', a.formatted_address,
    'street', COALESCE(NULLIF(a.place_name, ''), NULLIF(a.street, ''), split_part(a.formatted_address, ',', 1)),
    'city', COALESCE(a.city, ''),
    'state', COALESCE(a.state, ''),
    'country', COALESCE(a.country, ''),
    'additional_info', COALESCE(a.directions, ''),
    'latitude', a.latitude,
    'longitude', a.longitude,
    'place_id', a.place_id
  );
$$;

-- Same trigger as before (runs when the vendor accepts a paid order), now
-- filling the pickup from the vendor's store address and linking both ends.
CREATE OR REPLACE FUNCTION public.create_delivery_for_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.addresses%ROWTYPE;
BEGIN
  IF (OLD.status != NEW.status AND NEW.status IN ('accepted', 'processing')) AND
     NEW.payment_status = 'paid' AND
     NEW.delivery_type != 'pickup' THEN

    SELECT * INTO v_store
    FROM public.addresses
    WHERE profile_id = NEW.vendor_id
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1;

    INSERT INTO public.deliveries (
      order_id,
      status,
      estimated_pickup_time,
      estimated_delivery_time,
      delivery_fee,
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

-- ===================================================================
-- 6. profiles.address is replaced by the addresses table
-- ===================================================================

ALTER TABLE public.profiles DROP COLUMN address;
