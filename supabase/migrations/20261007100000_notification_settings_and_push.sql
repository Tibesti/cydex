-- ===================================================================
-- Notification settings and push notifications
--
-- Each user has "Email notifications" (on by default) and "Push
-- notifications" (off until they allow it on a device). Push goes through the
-- browser's Web Push: devices register a subscription (push_subscriptions),
-- and every new notification calls the send-push Edge Function, which sends
-- it to the user's devices. See docs/NOTIFICATIONS.md.
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.notification_settings (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their notification settings" ON public.notification_settings
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;

-- New accounts start with email on, push off
INSERT INTO public.notification_settings (profile_id)
SELECT id FROM public.profiles ON CONFLICT (profile_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_notification_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_settings (profile_id) VALUES (NEW.id) ON CONFLICT (profile_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Runs before the welcome trigger (alphabetical), so the welcome email is allowed
CREATE TRIGGER a_create_notification_settings
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_notification_settings();

CREATE OR REPLACE FUNCTION public.email_notifications_enabled(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT email_enabled FROM public.notification_settings WHERE profile_id = p_profile_id), true);
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
  WHERE p.id = p_user_id AND p.email IS NOT NULL
    -- Respects the user's "Email notifications" setting (on by default)
    AND public.email_notifications_enabled(p.id);
$$;


REVOKE EXECUTE ON FUNCTION public.queue_email(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- ===================================================================
-- Push subscriptions (one per browser/device)
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile ON public.push_subscriptions (profile_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their push subscriptions" ON public.push_subscriptions
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;

-- ===================================================================
-- Sending: each new notification calls the send-push Edge Function
-- (pg_net). The function only reads the notification id it's given and
-- sends it once, so the call needs no secret.
-- ===================================================================

-- Settings the database needs about its own project
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage app config" ON public.app_config
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Change this on a different (e.g. production) project
INSERT INTO public.app_config (key, value)
VALUES ('functions_url', 'https://hsnguuozyigpzstwqkrk.supabase.co/functions/v1')
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.push_new_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
BEGIN
  IF NEW.user_id IS NULL
     OR NOT COALESCE((SELECT push_enabled FROM public.notification_settings WHERE profile_id = NEW.user_id), false)
     OR NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE profile_id = NEW.user_id)
     OR to_regnamespace('net') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_url FROM public.app_config WHERE key = 'functions_url';
  IF v_url IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3)'
    USING v_url || '/send-push',
          jsonb_build_object('notification_id', NEW.id),
          jsonb_build_object('Content-Type', 'application/json');
  EXCEPTION WHEN OTHERS THEN
    -- A push that can't be sent never blocks the notification itself
    RAISE WARNING 'push not queued for notification %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER push_new_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.push_new_notification();

-- Saves this browser's subscription for the signed-in user (moving it from
-- whoever used this browser before) and turns push on for them
CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT, p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NULLIF(p_endpoint, '') IS NULL OR p_endpoint NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Invalid push subscription';
  END IF;
  INSERT INTO public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE
  SET profile_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent, created_at = now();
  INSERT INTO public.notification_settings (profile_id, push_enabled) VALUES (auth.uid(), true)
  ON CONFLICT (profile_id) DO UPDATE SET push_enabled = true, updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_push_subscription(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;
