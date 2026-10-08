-- ===================================================================
-- Rider trip count
--   rider_profiles.total_deliveries was never updated, so every rider
--   showed 0 trips. It's now recounted from delivered orders (customer
--   orders and rider requests) whenever an order is delivered.
--   The count and the rating are stats: riders can still edit their own
--   profile, but only the database or an admin can change these two.
-- ===================================================================

CREATE OR REPLACE FUNCTION public.refresh_rider_total_deliveries(p_rider_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('cydex.rider_stats', 'on', true);
  UPDATE public.rider_profiles
  SET total_deliveries = (SELECT count(*) FROM public.orders WHERE rider_id = p_rider_id AND status = 'delivered'),
      updated_at = now()
  WHERE id = p_rider_id;
  PERFORM set_config('cydex.rider_stats', 'off', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_rider_total_deliveries(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.count_rider_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.rider_id IS NOT NULL THEN
    PERFORM public.refresh_rider_total_deliveries(NEW.rider_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS count_rider_delivery ON public.orders;
CREATE TRIGGER count_rider_delivery
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered')
  EXECUTE FUNCTION public.count_rider_delivery();

-- The rating trigger (hidden reviews don't count) now marks its change as a stat update
CREATE OR REPLACE FUNCTION public.update_rider_average_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('cydex.rider_stats', 'on', true);
  UPDATE public.rider_profiles
  SET rating = (SELECT round(avg(rating)::numeric, 2) FROM public.rider_ratings WHERE rider_id = NEW.rider_id AND hidden_at IS NULL),
      updated_at = now()
  WHERE id = NEW.rider_id;
  PERFORM set_config('cydex.rider_stats', 'off', true);
  RETURN NEW;
END;
$$;

-- Riders editing their profile keep their real trip count and rating.
-- (Values are restored rather than rejected, so a profile save that sends
-- the whole row still works.)
CREATE OR REPLACE FUNCTION public.protect_rider_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_admin()
     AND COALESCE(current_setting('cydex.rider_stats', true), 'off') <> 'on' THEN
    NEW.total_deliveries := OLD.total_deliveries;
    NEW.rating := OLD.rating;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_rider_stats ON public.rider_profiles;
CREATE TRIGGER protect_rider_stats
  BEFORE UPDATE ON public.rider_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_rider_stats();

-- Backfill: every rider's real count so far
UPDATE public.rider_profiles rp
SET total_deliveries = (SELECT count(*) FROM public.orders o WHERE o.rider_id = rp.id AND o.status = 'delivered');
