# Production Deployment Checklist

Everything to do before Cydex takes real orders and real money, as of September 2026. Work top to bottom and tick each item (`[x]`) as it's done.

Feature work that isn't a launch blocker, such as rider verification and push notifications, stays in [APP_TODO.md](APP_TODO.md).

## 1. Code clean-up (before the production build)

- [ ] **Take the Squad secret key out of the browser completely.** Payments and withdrawals already run server-side. What's left:
  - Move virtual account creation (`src/services/squadVirtualAccountService.ts`, called from `walletSetupService.ts`) into an Edge Function.
  - Delete the unused files that still call Squad with the secret key: `src/services/squadTransferService.ts`, `src/services/squadWebhookHandler.ts`, `src/services/webhookHandler.ts`.
  - In `src/config/squad.ts`, remove `TEST_SECRET_KEY`, `PROD_SECRET_KEY` and `getSecretKey`, including the hardcoded fallback keys.
  - Remove `VITE_SQUAD_SECRET_KEY` and `VITE_SQUAD_PROD_SECRET_KEY` from `.env`, `.env.example` and Vercel.
- [ ] **Rotate both Squad secret keys** (sandbox and live) in the Squad dashboard once the step above is done. Both keys are in the git history, so treat them as public.
- [ ] **Read the Supabase URL and anon key from the environment.** They're hardcoded in `src/integrations/supabase/client.ts` and `src/lib/supabase.ts`. Use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. This is required if production uses a different Supabase project.
- [ ] **Use Cydex's own Google Maps key.** The current key belongs to Faramove. See [APP_TODO.md → General](APP_TODO.md#general).

## 2. Supabase

- [ ] **Decide which project is production.** Either keep `hsnguuozyigpzstwqkrk` and clear the test data, or create a fresh project for production and keep this one for testing (recommended).
  - For a new project, set it up with:
    ```
    npx supabase link --project-ref <prod-ref>
    npx supabase db push --linked
    npx supabase functions deploy squad-checkout squad-webhook squad-payout send-emails
    ```
    Then update `project_id` in `supabase/config.toml`.
  - If you keep the current project, delete the test orders, wallets, transactions, payout requests and notifications, and remove test accounts under Authentication → Users.
- [ ] **Upgrade to a paid plan (Pro).** Free projects pause after a week without activity and have no daily backups.
  - Turn on backups, and point-in-time recovery if the budget allows.
- [ ] **Auth URLs.** Go to Authentication → URL Configuration.
  - Set **Site URL** to the live domain.
  - Add these redirect URLs: `https://<domain>/auth` (sign-up confirmation) and `https://<domain>/auth/reset-password` (password reset).
- [ ] **Auth emails through your own SMTP.** Supabase's built-in email only sends a few messages per hour.
  - Under Authentication → Emails → SMTP Settings, add the email provider's SMTP details. Resend offers SMTP too.
  - Customise the confirmation and reset email templates with Cydex branding.
- [ ] **Run the Security Advisor and Performance Advisor** under Advisors in the dashboard, and fix anything marked error or warning. Also turn on leaked-password protection under Authentication.
- [ ] **Check Realtime** under Database → Publications → `supabase_realtime`. It should include `notifications` (for the unread badges and toasts) and `orders` (for live order updates).
- [ ] **Check the scheduled jobs** under Integrations → Cron. `mark-stale-riders-offline` should run every minute. The email job gets added in section 4.
- [ ] **Check the prices** in the `pricing_config` table:
  - `base_rate` 600
  - `distance_rate_per_km` 200
  - `service_charge_rate` 0.15
  - `vendor_commission_rate` 0.10
  - `rider_share_rate` 0.85
- [ ] **Create the admin account(s).** Sign up normally, then set `profiles.role` to `admin` in the Table Editor.

## 3. Squad (live)

- [ ] **Finish Squad KYC** so the live keys and payouts are enabled.
- [ ] **Set the live function secrets:**
  ```
  npx supabase secrets set \
    SQUAD_SECRET_KEY=<live secret key> \
    SQUAD_API_URL=https://api-d.squadco.com \
    SQUAD_MERCHANT_ID=<live merchant id> \
    APP_URL=https://<domain>
  ```
  Type the key in directly. Don't wrap it in `< >`, because zsh reads that as a file.
- [ ] **Set the live webhook URL** in the Squad live dashboard: `https://<prod-ref>.supabase.co/functions/v1/squad-webhook`
- [ ] **Keep money in the Squad balance for withdrawals.** Vendor, rider and customer withdrawals are sent from Cydex's Squad balance. If it's empty, transfers fail and the money goes back to the user's wallet.

## 4. Emails (welcome, payment confirmed, refund)

The database queues these in `email_outbox`. The `send-emails` function sends them.

- [ ] **Resend:** create an account and add Cydex's domain. Add the DNS records it gives you (SPF, DKIM) at the domain registrar, and wait until the domain shows as verified.
- [ ] **Secrets:**
  ```
  npx supabase secrets set RESEND_API_KEY=<key> EMAIL_FROM="Cydex <hello@your-domain>" EMAIL_CRON_SECRET=<long random string>
  ```
- [ ] **Schedule the sender.**
  - Enable the `pg_net` extension under Database → Extensions.
  - Run this in the SQL editor, using the same `EMAIL_CRON_SECRET`:
    ```sql
    select vault.create_secret('<EMAIL_CRON_SECRET>', 'email_cron_secret');

    select cron.schedule('send-emails', '* * * * *', $$
      select net.http_post(
        url := 'https://<prod-ref>.supabase.co/functions/v1/send-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
        ),
        body := '{}'::jsonb
      );
    $$);
    ```
- [ ] **Check it works:** sign up a test account. Within a minute, its welcome email in `email_outbox` should move to `sent`.

## 5. Hosting (Vercel)

- [ ] **Environment variables** (Production), all public by design:

  | Variable | Value |
  |---|---|
  | `VITE_SUPABASE_URL` | `https://<prod-ref>.supabase.co` |
  | `VITE_SUPABASE_ANON_KEY` | the production anon key |
  | `VITE_APP_URL` | `https://<domain>` |
  | `VITE_NODE_ENV` | `production` |
  | `VITE_GOOGLE_MAPS_API_KEY` | Cydex's key, restricted to the domain |
  | `VITE_SQUAD_PROD_PUBLIC_KEY` | the live **public** key |

  **Never** add a secret key, such as a Squad secret key or the Supabase service role key, as a `VITE_` variable. Those go in Supabase function secrets only.
- [ ] **Domain and HTTPS:** connect the domain in Vercel. `vercel.json` already sends every page to the app.
- [ ] **Restrict the Google Maps key** to `https://<domain>/*` in Google Cloud.

## 6. Launch test (with real money, small amounts)

Use three test accounts on phones (customer, vendor and rider) and go through the whole flow. See [ORDER_FLOW.md](ORDER_FLOW.md).

- [ ] Sign up each role. Each gets a welcome notification and email, and the vendor sets a store location.
- [ ] The customer orders from the vendor and pays with a real card. The order becomes paid, the vendor gets "New order", and the customer gets "Payment confirmed" plus an email.
- [ ] Close the tab straight after paying on a second order. It should still become paid, which shows the webhook works.
- [ ] Vendor accepts, then marks it ready. The rider (online, within 5 km) gets "Order nearby" and can accept it.
- [ ] Rider taps **Head to vendor**, shows the pickup code, and the vendor enters it. Then the rider enters the customer's delivery code, and the order becomes **Delivered**.
- [ ] The vendor's and rider's wallets are credited with the amounts shown on their order screens.
- [ ] Cancel a paid pending order as the customer, and reject a paid order as the vendor. Both refund to the customer's wallet with a notification and an email.
- [ ] The vendor withdraws a small amount. The money arrives in the bank, and the request becomes completed.

## 7. After launch

- [ ] **Check regularly:**
  - Edge Function logs (dashboard → Edge Functions → Logs) for `squad-webhook` and `squad-payout` errors
  - `email_outbox` rows with status `failed`
  - payout requests stuck in `processing`
- [ ] **Decide who handles support cases:** locked handover codes, stuck deliveries and failed payouts. The admin tools for these are still to do; see [APP_TODO.md → Admin](APP_TODO.md#admin).
