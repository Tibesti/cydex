-- ===================================================================
-- Vendor storefront (logo, banner, cards) and ratings (vendors + riders)
-- See docs/ORDER_FLOW.md → Ratings and docs/APP_TODO.md.
-- ===================================================================

-- ===================================================================
-- 1. Store images: logo = profiles.avatar, banner = profiles.store_banner_url
--    Files live in the public "store-images" bucket under <vendor id>/...
-- ===================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS store_banner_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('store-images', 'store-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Store images are public" ON storage.objects;
DROP POLICY IF EXISTS "Vendors upload their store images" ON storage.objects;
DROP POLICY IF EXISTS "Vendors replace their store images" ON storage.objects;
DROP POLICY IF EXISTS "Vendors delete their store images" ON storage.objects;

CREATE POLICY "Store images are public" ON storage.objects
  FOR SELECT USING (bucket_id = 'store-images');
CREATE POLICY "Vendors upload their store images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'store-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Vendors replace their store images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'store-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Vendors delete their store images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'store-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ===================================================================
-- 2. Vendor cards for the customer's delivery address (within 5 km)
--    One call for the dashboard sections and the vendor list.
--    recent_orders = paid orders (not cancelled/rejected) in the last 30 days.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.vendor_cards_near_address(p_address_id UUID)
RETURNS TABLE (
  vendor_id UUID,
  name TEXT,
  logo_url TEXT,
  banner_url TEXT,
  verified BOOLEAN,
  distance_km NUMERIC,
  product_count INTEGER,
  categories TEXT[],
  average_rating NUMERIC,
  rating_count INTEGER,
  recent_orders INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.vendor_id,
    p.name,
    p.avatar,
    p.store_banner_url,
    COALESCE(p.verified, false),
    n.distance_km,
    (SELECT count(*)::int FROM public.products pr WHERE pr.vendor_id = n.vendor_id AND pr.status = 'active'),
    COALESCE((SELECT array_agg(DISTINCT pr.category) FROM public.products pr
              WHERE pr.vendor_id = n.vendor_id AND pr.status = 'active' AND pr.category IS NOT NULL), '{}'),
    (SELECT round(avg(r.rating)::numeric, 1) FROM public.vendor_ratings r WHERE r.vendor_id = n.vendor_id),
    (SELECT count(*)::int FROM public.vendor_ratings r WHERE r.vendor_id = n.vendor_id),
    (SELECT count(*)::int FROM public.orders o
     WHERE o.vendor_id = n.vendor_id AND o.payment_status = 'paid'
       AND o.status NOT IN ('cancelled', 'rejected')
       AND o.created_at > now() - interval '30 days')
  FROM public.vendors_near_address(p_address_id) n
  JOIN public.profiles p ON p.id = n.vendor_id
  WHERE COALESCE(p.status, 'active') = 'active';
$$;

REVOKE EXECUTE ON FUNCTION public.vendor_cards_near_address(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_cards_near_address(UUID) TO authenticated;

-- The vendor page header: store name, logo, banner, verified, rating, store
-- address (text only, no coordinates) and distance from the given address
CREATE OR REPLACE FUNCTION public.vendor_storefront(p_vendor_id UUID, p_address_id UUID DEFAULT NULL)
RETURNS TABLE (
  vendor_id UUID,
  name TEXT,
  logo_url TEXT,
  banner_url TEXT,
  verified BOOLEAN,
  store_address TEXT,
  average_rating NUMERIC,
  rating_count INTEGER,
  distance_km NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH store AS (
    SELECT * FROM public.addresses
    WHERE profile_id = p_vendor_id
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1
  ),
  dest AS (
    SELECT latitude, longitude FROM public.addresses WHERE id = p_address_id AND profile_id = auth.uid()
  )
  SELECT
    p.id,
    p.name,
    p.avatar,
    p.store_banner_url,
    COALESCE(p.verified, false),
    (SELECT s.formatted_address FROM store s),
    (SELECT round(avg(r.rating)::numeric, 1) FROM public.vendor_ratings r WHERE r.vendor_id = p.id),
    (SELECT count(*)::int FROM public.vendor_ratings r WHERE r.vendor_id = p.id),
    (SELECT round((public.distance_m(s.latitude, s.longitude, d.latitude, d.longitude) / 1000)::numeric, 2)
     FROM store s, dest d)
  FROM public.profiles p
  WHERE p.id = p_vendor_id AND lower(p.role) = 'vendor';
$$;

REVOKE EXECUTE ON FUNCTION public.vendor_storefront(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_storefront(UUID, UUID) TO authenticated;

-- ===================================================================
-- 3. Vendor ratings: only for the customer's delivered orders from that vendor
-- ===================================================================

DROP POLICY IF EXISTS "Customers can rate their own orders" ON public.vendor_ratings;
CREATE POLICY "Customers can rate their own orders" ON public.vendor_ratings
  FOR INSERT WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = vendor_ratings.order_id
        AND o.customer_id = auth.uid()
        AND o.vendor_id = vendor_ratings.vendor_id
        AND o.status = 'delivered'
    )
  );

-- ===================================================================
-- 4. Rider ratings
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.rider_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_ratings_rider_id ON public.rider_ratings (rider_id);
ALTER TABLE public.rider_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can rate the rider of their delivered orders" ON public.rider_ratings
  FOR INSERT WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = rider_ratings.order_id
        AND o.customer_id = auth.uid()
        AND o.rider_id = rider_ratings.rider_id
        AND o.status = 'delivered'
    )
  );
CREATE POLICY "Customers see their rider ratings" ON public.rider_ratings
  FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "Riders see their ratings" ON public.rider_ratings
  FOR SELECT USING (rider_id = auth.uid());
CREATE POLICY "Admins can manage rider ratings" ON public.rider_ratings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT, INSERT ON public.rider_ratings TO authenticated;

-- Keep rider_profiles.rating as the rider's average
CREATE OR REPLACE FUNCTION public.update_rider_average_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rider_profiles
  SET rating = (SELECT round(avg(rating)::numeric, 2) FROM public.rider_ratings WHERE rider_id = NEW.rider_id),
      updated_at = now()
  WHERE id = NEW.rider_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_rider_average_rating
  AFTER INSERT ON public.rider_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_rider_average_rating();

-- ===================================================================
-- 5. "Rate your rider" pop-up
--    Shown at login for the customer's most recent delivered order, unless
--    they've rated that rider or closed the pop-up for that order.
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.rider_rating_prompt_dismissals (
  order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rider_rating_prompt_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers manage their prompt dismissals" ON public.rider_rating_prompt_dismissals
  FOR ALL USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());
GRANT SELECT, INSERT ON public.rider_rating_prompt_dismissals TO authenticated;

CREATE OR REPLACE FUNCTION public.rider_rating_prompt()
RETURNS TABLE (
  order_id UUID,
  order_number TEXT,
  rider_id UUID,
  rider_name TEXT,
  rider_avatar TEXT,
  delivered_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT o.id, o.order_number, o.rider_id, o.delivered_at
    FROM public.orders o
    WHERE o.customer_id = auth.uid() AND o.status = 'delivered' AND o.rider_id IS NOT NULL
    ORDER BY o.delivered_at DESC NULLS LAST, o.updated_at DESC
    LIMIT 1
  )
  SELECT l.id, l.order_number, l.rider_id, p.name, p.avatar, l.delivered_at
  FROM latest l
  JOIN public.profiles p ON p.id = l.rider_id
  WHERE NOT EXISTS (SELECT 1 FROM public.rider_ratings r WHERE r.order_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM public.rider_rating_prompt_dismissals d WHERE d.order_id = l.id);
$$;

REVOKE EXECUTE ON FUNCTION public.rider_rating_prompt() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_rating_prompt() TO authenticated;
