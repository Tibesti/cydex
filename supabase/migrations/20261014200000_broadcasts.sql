-- Broadcasts: an admin sends an announcement to customers, vendors and/or
-- riders, as an in-app notification with push, as an email, or both. It can go
-- to everyone in those groups or only to people near a place (a point and a
-- radius), now or at a set time.
--
-- "Near" means: one of their saved addresses is inside the circle (a
-- customer's delivery addresses, a vendor's store, a rider's home), or, for
-- riders, their last known location is.

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  send_push BOOLEAN NOT NULL DEFAULT true,
  send_email BOOLEAN NOT NULL DEFAULT false,
  -- Any of 'customer', 'vendor', 'rider'
  audience TEXT[] NOT NULL,
  -- NULL radius: everyone in the audience
  area_address TEXT,
  area_latitude DOUBLE PRECISION,
  area_longitude DOUBLE PRECISION,
  radius_km NUMERIC(6,2) CHECK (radius_km IS NULL OR radius_km > 0),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'cancelled')),
  sent_at TIMESTAMPTZ,
  recipients INTEGER,
  emails_queued INTEGER,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (send_push OR send_email),
  CHECK (audience <@ ARRAY['customer', 'vendor', 'rider'] AND array_length(audience, 1) >= 1),
  CHECK (radius_km IS NULL OR (area_latitude IS NOT NULL AND area_longitude IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS broadcasts_due_idx ON public.broadcasts (scheduled_at) WHERE status = 'scheduled';

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read broadcasts" ON public.broadcasts;
CREATE POLICY "Admins read broadcasts" ON public.broadcasts FOR SELECT USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.broadcasts FROM anon, authenticated;

-- Who a broadcast reaches
CREATE OR REPLACE FUNCTION public.broadcast_recipients(
  p_audience TEXT[],
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_radius_km NUMERIC
)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE lower(p.role) = ANY (p_audience)
    AND lower(p.role) IN ('customer', 'vendor', 'rider')
    AND COALESCE(p.status, 'active') <> 'suspended'
    -- Vendors and riders are suspended through their verification
    AND NOT EXISTS (SELECT 1 FROM public.verifications v WHERE v.profile_id = p.id AND v.status = 'suspended')
    AND (
      p_radius_km IS NULL OR p_latitude IS NULL OR p_longitude IS NULL
      OR EXISTS (SELECT 1 FROM public.addresses a
                 WHERE a.profile_id = p.id
                   AND public.distance_m(a.latitude, a.longitude, p_latitude, p_longitude) <= p_radius_km * 1000)
      OR EXISTS (SELECT 1 FROM public.rider_profiles rp
                 WHERE rp.id = p.id AND rp.current_location ? 'latitude' AND rp.current_location ? 'longitude'
                   AND public.distance_m((rp.current_location ->> 'latitude')::float8,
                                         (rp.current_location ->> 'longitude')::float8,
                                         p_latitude, p_longitude) <= p_radius_km * 1000)
    );
$$;
REVOKE EXECUTE ON FUNCTION public.broadcast_recipients(TEXT[], DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC) FROM PUBLIC, anon, authenticated;

-- Admin: how many people a broadcast would reach, before sending it
CREATE OR REPLACE FUNCTION public.admin_broadcast_reach(
  p_audience TEXT[],
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_radius_km NUMERIC DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  RETURN (SELECT count(*)::int FROM public.broadcast_recipients(p_audience, p_latitude, p_longitude, p_radius_km));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_broadcast_reach(TEXT[], DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_reach(TEXT[], DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC) TO authenticated;

-- Sends one broadcast (once): an in-app notification, which also goes out as a
-- push to people who have push on, and/or an email to people who have email
-- notifications on
CREATE OR REPLACE FUNCTION public.send_broadcast(p_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.broadcasts%ROWTYPE;
  v_user UUID;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO b FROM public.broadcasts WHERE id = p_id AND status = 'scheduled' FOR UPDATE;
  IF b.id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_user IN SELECT public.broadcast_recipients(b.audience, b.area_latitude, b.area_longitude, b.radius_km) LOOP
    IF b.send_push THEN
      PERFORM public.notify_user(v_user, 'announcement', b.title, b.body);
    END IF;
    IF b.send_email THEN
      PERFORM public.queue_email(v_user, 'announcement', b.title,
        jsonb_build_object('title', b.title, 'body', b.body, 'broadcast_id', b.id));
    END IF;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.broadcasts
  SET status = 'sent', sent_at = now(), recipients = v_count,
      emails_queued = CASE WHEN b.send_email
        THEN (SELECT count(*)::int FROM public.email_outbox e WHERE e.template = 'announcement' AND e.data ->> 'broadcast_id' = b.id::text)
        ELSE 0 END
  WHERE id = b.id;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_broadcast(UUID) FROM PUBLIC, anon, authenticated;

-- Runs every minute (pg_cron): sends broadcasts whose time has come
CREATE OR REPLACE FUNCTION public.send_due_broadcasts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_count INTEGER := 0;
BEGIN
  FOR v_id IN SELECT id FROM public.broadcasts WHERE status = 'scheduled' AND scheduled_at <= now() ORDER BY scheduled_at LOOP
    PERFORM public.send_broadcast(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_due_broadcasts() FROM PUBLIC, anon, authenticated;

-- Admin: create a broadcast. With no time (or a time that has passed) it goes now.
CREATE OR REPLACE FUNCTION public.admin_save_broadcast(
  p_title TEXT,
  p_body TEXT,
  p_audience TEXT[],
  p_send_push BOOLEAN DEFAULT true,
  p_send_email BOOLEAN DEFAULT false,
  p_area_address TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_radius_km NUMERIC DEFAULT NULL,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT := NULLIF(trim(p_title), '');
  v_body TEXT := NULLIF(trim(p_body), '');
  v_audience TEXT[] := ARRAY(SELECT DISTINCT lower(a) FROM unnest(COALESCE(p_audience, '{}')) a ORDER BY 1);
  v_id UUID;
BEGIN
  PERFORM public.require_admin();
  IF v_title IS NULL OR length(v_title) > 80 THEN
    RAISE EXCEPTION 'Enter a title of up to 80 characters';
  END IF;
  IF v_body IS NULL OR length(v_body) > 2000 THEN
    RAISE EXCEPTION 'Enter the message (up to 2,000 characters)';
  END IF;
  IF NOT COALESCE(p_send_push, false) AND NOT COALESCE(p_send_email, false) THEN
    RAISE EXCEPTION 'Choose push notification, email, or both';
  END IF;
  IF COALESCE(array_length(v_audience, 1), 0) = 0 OR NOT v_audience <@ ARRAY['customer', 'vendor', 'rider'] THEN
    RAISE EXCEPTION 'Choose who to send it to: customers, vendors or riders';
  END IF;
  IF p_radius_km IS NOT NULL THEN
    IF p_latitude IS NULL OR p_longitude IS NULL THEN
      RAISE EXCEPTION 'Choose the place on the map';
    END IF;
    IF p_radius_km <= 0 OR p_radius_km > 500 THEN
      RAISE EXCEPTION 'The radius must be between 0.1 and 500 km';
    END IF;
  END IF;
  IF p_scheduled_at IS NOT NULL AND p_scheduled_at > now() + interval '1 year' THEN
    RAISE EXCEPTION 'Choose a time within the next year';
  END IF;

  INSERT INTO public.broadcasts (title, body, send_push, send_email, audience, area_address, area_latitude, area_longitude,
                                 radius_km, scheduled_at, created_by)
  VALUES (v_title, v_body, COALESCE(p_send_push, false), COALESCE(p_send_email, false), v_audience,
          CASE WHEN p_radius_km IS NOT NULL THEN NULLIF(trim(p_area_address), '') END,
          CASE WHEN p_radius_km IS NOT NULL THEN p_latitude END,
          CASE WHEN p_radius_km IS NOT NULL THEN p_longitude END,
          p_radius_km, GREATEST(COALESCE(p_scheduled_at, now()), now()), auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.log_admin_action('create_broadcast', 'broadcast', v_id::text, NULL,
    (SELECT to_jsonb(b) FROM public.broadcasts b WHERE id = v_id));

  IF p_scheduled_at IS NULL OR p_scheduled_at <= now() THEN
    PERFORM public.send_broadcast(v_id);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_save_broadcast(TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_broadcast(TEXT, TEXT, TEXT[], BOOLEAN, BOOLEAN, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, TIMESTAMPTZ) TO authenticated;

-- Admin: stop a broadcast that hasn't gone out yet
CREATE OR REPLACE FUNCTION public.admin_cancel_broadcast(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();
  UPDATE public.broadcasts SET status = 'cancelled' WHERE id = p_id AND status = 'scheduled';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a broadcast that hasn''t been sent can be cancelled';
  END IF;
  PERFORM public.log_admin_action('cancel_broadcast', 'broadcast', p_id::text);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_broadcast(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_broadcast(UUID) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    PERFORM cron.schedule('send-due-broadcasts', '* * * * *', 'SELECT public.send_due_broadcasts()');
  END IF;
END;
$$;
