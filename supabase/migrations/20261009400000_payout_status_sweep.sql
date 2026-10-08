-- ===================================================================
-- Withdrawals finish on their own
--   After an admin approves a withdrawal, Squad sends the money but the
--   payout stayed 'processing' until someone pressed "Check status".
--   Every 10 minutes pg_cron now asks the squad-payout function to check
--   every 'processing' withdrawal with Squad: it becomes 'completed', or
--   'failed' with the money returned, and the owner is notified.
--   The call proves itself with a random secret generated here, in the
--   database (never in the code): app_config.payout_sweep_secret.
-- ===================================================================

INSERT INTO public.app_config (key, value)
VALUES ('payout_sweep_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trigger_payout_sweep()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN;
  END IF;
  SELECT value INTO v_url FROM public.app_config WHERE key = 'functions_url';
  SELECT value INTO v_secret FROM public.app_config WHERE key = 'payout_sweep_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN;
  END IF;
  -- Only if something is waiting, so the function isn't woken for nothing
  IF NOT EXISTS (SELECT 1 FROM public.vendor_payout_requests WHERE status = 'processing')
     AND NOT EXISTS (SELECT 1 FROM public.rider_payout_requests WHERE status = 'processing')
     AND NOT EXISTS (SELECT 1 FROM public.customer_withdrawal_requests WHERE status = 'processing') THEN
    RETURN;
  END IF;
  EXECUTE format(
    'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
    v_url || '/squad-payout',
    jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret)::text,
    '{"action":"sweep"}'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_payout_sweep() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    PERFORM cron.schedule('payout-status-sweep', '*/10 * * * *', 'SELECT public.trigger_payout_sweep()');
  END IF;
END;
$$;
