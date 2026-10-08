# Deployment Checklist

Everything to set up before Cydex takes real orders and real money: accounts, environment variables, Supabase settings, Squad, emails, hosting and the launch test. Up to date as of 8 October 2026.

Work top to bottom and tick each item (`[x]`) as it's done. Steps marked **(new project only)** are only needed if production gets its own Supabase project. The current project (`hsnguuozyigpzstwqkrk`) already has them.

Feature work that isn't a launch blocker stays in [APP_TODO.md](APP_TODO.md).

> **Run the Supabase CLI as** `npx -y supabase@2.118.0 …`. The unpinned `npx supabase` fails on this Mac. The commands below write `supabase` for short.
>
> **Typing secrets:** paste the value directly, e.g. `KEY=abc123`. Don't wrap it in `< >`, because zsh reads that as a file.

---

## 1. Accounts to create

| Service | What it's for | Plan | Notes |
|---|---|---|---|
| [ ] **Domain registrar** (e.g. Namecheap, Whogohost) | The app's web address, and the email sending domain | Yearly | You'll add DNS records for Vercel and Resend |
| [ ] **Supabase** | Database, logins, file storage, Edge Functions | **Pro** (about $25/month) | Free projects pause after a week of no activity and have no backups |
| [ ] **Vercel** | Hosts the web app | Hobby is fine to start; Pro for a team | Connect it to the GitHub repo |
| [ ] **GitHub** | The code | Free | Already set up: `cybersmithstudios/cydex` and `Tibesti/cydex` |
| [ ] **Squad** (GTBank) | Card payments, virtual accounts, payouts to banks | Live account | Needs **KYC** (business documents) before live keys and payouts work |
| [ ] **Resend** | Sends the app's emails, and optionally the login emails | Free tier to start | Needs the domain verified |
| [ ] **Google Cloud** | Maps, address search and the distance for delivery fees | Pay as you go, with a free monthly credit | Must be **Cydex's own** account. The current key belongs to Faramove |

Keep the logins for all of these in a password manager the team can access.

---

## 2. Code clean-up (before the production build)

- [ ] **Take the Squad secret key out of the browser completely.** Payments and withdrawals already run server-side. What's left:
  - Move virtual account creation (`src/services/squadVirtualAccountService.ts`, called from `walletSetupService.ts`) into an Edge Function.
  - Delete the unused files that still call Squad with the secret key: `src/services/squadTransferService.ts`, `src/services/squadWebhookHandler.ts`, `src/services/webhookHandler.ts`.
  - In `src/config/squad.ts`, remove `TEST_SECRET_KEY`, `PROD_SECRET_KEY` and `getSecretKey`, including the hardcoded fallback keys.
  - Remove `VITE_SQUAD_SECRET_KEY` and `VITE_SQUAD_PROD_SECRET_KEY` from `.env`, `.env.example` and Vercel.
- [ ] **Rotate both Squad secret keys** (sandbox and live) in the Squad dashboard once the step above is done. Both keys are in the git history, so treat them as public.
- [ ] **Read the Supabase URL and anon key from the environment.** They're hardcoded in `src/integrations/supabase/client.ts` and `src/lib/supabase.ts`. Change both to use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. This is required if production uses a different Supabase project.
- [ ] **Use Cydex's own Google Maps key** (section 6).

---

## 3. Supabase

### 3.1 Project

- [ ] **Decide which project is production.**
  - **Recommended:** create a fresh project for production and keep `hsnguuozyigpzstwqkrk` for testing.
  - **Or keep the current one:** delete the test orders, wallets, transactions, payout requests and notifications, and remove test accounts under Authentication → Users.
- [ ] **(new project only)** Create it in the region closest to Nigeria (e.g. `eu-west`, London). Save the database password in the password manager.
- [ ] **Upgrade to Pro**, and turn on daily backups. Add point-in-time recovery if the budget allows.

### 3.2 Database and functions

- [ ] **(new project only)** Link the project and push everything:
  ```
  supabase link --project-ref <prod-ref>
  supabase db push --linked
  supabase functions deploy squad-checkout squad-webhook squad-payout send-emails send-push admin-team
  ```
  Then update `project_id` in `supabase/config.toml`. `config.toml` already turns off the login check for `squad-webhook`, `send-emails` and `send-push`, which are called by Squad and the database, not by a signed-in user.
- [ ] **(new project only)** Point push notifications and the withdrawal status check at the new project. Run in the SQL editor:
  ```sql
  update public.app_config set value = 'https://<prod-ref>.supabase.co/functions/v1' where key = 'functions_url';
  ```
- [ ] **Check what the migrations set up:**
  - **Database → Extensions:** `pg_net` and `pg_cron` are on. Turn them on if not, then run `supabase db push --linked` again.
  - **Storage:** buckets `store-images` (public) and `verification-docs` (private), both with a 5 MB limit.
  - **Database → Publications → `supabase_realtime`:** includes `notifications` (unread badges and toasts), `orders` and `deliveries` (live order updates).
  - **Integrations → Cron:** `mark-stale-riders-offline` runs every minute, and `payout-status-sweep` every 10 minutes (it marks approved withdrawals as paid once Squad confirms them). The email job is added in section 4.

### 3.3 Authentication settings

Supabase dashboard → **Authentication**.

- [ ] **URL Configuration:**
  - **Site URL:** `https://<domain>`
  - **Redirect URLs:**
    - `https://<domain>/auth`: sign-up confirmation
    - `https://<domain>/auth/set-password`: password reset **and admin invites**
    - While testing, also `http://localhost:8080/auth` and `http://localhost:8080/auth/set-password`
- [ ] **Sign In / Providers → Email:** **Confirm email** on.
- [ ] **Emails → SMTP Settings:** add Resend's SMTP details (Resend → Settings → SMTP). Supabase's built-in email only sends a few messages per hour, which isn't enough for real users.
  - Host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key
  - Sender: `Cydex <hello@your-domain>`
- [ ] **Emails → Templates:** brand these with Cydex's name and colours:
  - **Confirm signup**
  - **Reset password:** the link opens the Set password page
  - **Invite user:** sent when an admin invites another admin. Suggested subject: "You've been invited to the Cydex admin team"
- [ ] **Attack Protection:** turn on **leaked password protection**.
- [ ] **Advisors:** run the **Security Advisor** and **Performance Advisor**, and fix anything marked error or warning.

### 3.4 Function secrets

Supabase dashboard → **Edge Functions → Secrets**, or `supabase secrets set NAME=value …`. These are private and are never sent to the browser. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

| Secret | Value | Used by |
|---|---|---|
| [ ] `SQUAD_SECRET_KEY` | Squad **live** secret key | checkout, webhook, payouts |
| [ ] `SQUAD_API_URL` | `https://api-d.squadco.com` (live). The sandbox is `https://sandbox-api-d.squadco.com` | checkout, payouts |
| [ ] `SQUAD_MERCHANT_ID` | Live merchant ID from the Squad dashboard | payout references |
| [ ] `APP_URL` | `https://<domain>` | Squad's return page after paying, admin invite links |
| [ ] `RESEND_API_KEY` | From Resend → API Keys | `send-emails` |
| [ ] `EMAIL_FROM` | `Cydex <hello@your-domain>` | `send-emails` |
| [ ] `EMAIL_CRON_SECRET` | A long random string (e.g. `openssl rand -hex 32`) | `send-emails` (section 4) |
| [ ] `VAPID_PUBLIC_KEY` | From `npx web-push generate-vapid-keys` | `send-push` |
| [ ] `VAPID_PRIVATE_KEY` | Same command (keep it secret) | `send-push` |
| [ ] `VAPID_SUBJECT` | `mailto:hello@your-domain` | `send-push` |

Generate **new** VAPID keys for production. Phones that allowed notifications on the test project have to allow them again.

### 3.5 First admin and prices

- [ ] **Create the first admin account:** sign up normally, then set `profiles.role` to `admin` in the Table Editor. Invite everyone else from **Admin → Users → Invite admin** ([ADMIN.md → Users](ADMIN.md#users)).
- [ ] **Check the prices** on **Admin → Pricing** (they can be changed there at any time):
  - Minimum delivery fare ₦600, price per km ₦200
  - Service Charge 15%, vendor commission 10%, rider-request commission 10%
  - Rider share of the delivery fee 85%
- [ ] **Business categories:** check the list in **Admin → Verifications → Business categories**. Restaurant is there by default.
- [ ] **Review the verification queue** (Admin → Verifications) before launch, so the first vendors and riders aren't left waiting.

---

## 4. Emails (Resend)

The database queues emails in `email_outbox` (welcome, payment confirmed, refund, verification, suspension). The `send-emails` function sends them every minute.

- [ ] In Resend, **add Cydex's domain** and add the DNS records it gives you (SPF, DKIM) at the domain registrar. Wait until the domain shows as **Verified**.
- [ ] Set `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_CRON_SECRET` (section 3.4).
- [ ] **Schedule the sender.** Run in the SQL editor, using the same `EMAIL_CRON_SECRET`:
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
- [ ] **Check it works:** sign up a test account. Within a minute its welcome email shows as **Sent** on **Admin → Emails**.

---

## 5. Squad (live)

- [ ] **Finish Squad KYC** so the live keys and payouts are enabled.
- [ ] **Set the live function secrets** (section 3.4): `SQUAD_SECRET_KEY`, `SQUAD_API_URL`, `SQUAD_MERCHANT_ID`, `APP_URL`.
- [ ] **Set the webhook URL** in the Squad **live** dashboard: `https://<prod-ref>.supabase.co/functions/v1/squad-webhook`. This is how payments are confirmed even if the customer closes the tab.
- [ ] **Keep money in the Squad balance.** Withdrawals are sent from Cydex's Squad balance when an admin approves them. If it's empty, the transfer fails and the money goes back to the user's wallet.

---

## 6. Google Maps

- [ ] In Cydex's Google Cloud project, turn on billing and enable **Places API (New)**, **Maps JavaScript API** and **Geocoding API**.
- [ ] Create an API key (APIs & Services → Credentials) and **restrict** it:
  - Websites: `https://<domain>/*` (and `http://localhost:8080/*` for a separate dev key)
  - APIs: only the three above
- [ ] Put it in `VITE_GOOGLE_MAPS_API_KEY` (section 7).
- [ ] Set a **budget alert** in Google Cloud billing, so a spike doesn't go unnoticed.

---

## 7. Environment variables (the web app)

Every `VITE_` variable is built into the website, so **anyone can read it**. Only public values go here; secrets go in the function secrets (section 3.4).

### Vercel → Project → Settings → Environment Variables (Production)

| Variable | Value | Needed |
|---|---|---|
| [ ] `VITE_SUPABASE_URL` | `https://<prod-ref>.supabase.co` | Yes (once section 2 is done) |
| [ ] `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → **anon / publishable** key | Yes (once section 2 is done) |
| [ ] `VITE_APP_URL` | `https://<domain>` | Yes |
| [ ] `VITE_NODE_ENV` | `production` | Yes: switches Squad to live |
| [ ] `VITE_GOOGLE_MAPS_API_KEY` | Cydex's restricted key | Yes |
| [ ] `VITE_SQUAD_PROD_PUBLIC_KEY` | Squad live **public** key | Yes |
| [ ] `VITE_SQUAD_MERCHANT_ID` | Squad live merchant ID | Yes, for virtual accounts |
| [ ] `VITE_SQUAD_VIRTUAL_ACCOUNT_PREFIX` | `CYDEX` (or what Squad assigns) | Yes, for virtual accounts |
| [ ] `VITE_SQUAD_API_URL` | `https://api-d.squadco.com` | Yes, for virtual accounts |
| [ ] `VITE_VAPID_PUBLIC_KEY` | The production VAPID **public** key | Yes, for push notifications |

**Don't add:**
- `VITE_SQUAD_SECRET_KEY` and `VITE_SQUAD_PROD_SECRET_KEY`: to be removed (section 2).
- `VITE_SQUAD_WEBHOOK_SECRET` and `VITE_PAYSTACK_WEBHOOK_SECRET`: not used.
- **Never** a secret key (Squad secret, Supabase service role, VAPID private, Resend) as a `VITE_` variable.

### Local `.env` (for `npm run dev`)

Copy `.env.example` to `.env` and fill in the same names, with **sandbox** Squad keys and the test Supabase project. `.env` is in `.gitignore`; never commit it. After editing it, restart `npm run dev`.

---

## 8. Hosting (Vercel)

- [ ] **Import the GitHub repo** in Vercel. Framework **Vite**, build command `npm run build`, output folder `dist`. `vercel.json` already sends every page to the app.
- [ ] Choose the **production branch** (the branch Vercel deploys to the live site).
- [ ] Add the environment variables (section 7), then **redeploy**. Vite only reads them at build time.
- [ ] **Domain:** add it under Settings → Domains, and add the DNS records Vercel shows at the registrar. HTTPS is automatic.
- [ ] Update everything that mentions the domain: Supabase **Site URL** and **Redirect URLs** (3.3), `APP_URL` (3.4), `VITE_APP_URL` (7), and the Google Maps key restriction (6).

---

## 9. Launch test (real money, small amounts)

Use three test accounts on phones (customer, vendor and rider) and an admin account, and go through the whole flow. See [ORDER_FLOW.md](ORDER_FLOW.md).

- [ ] **Sign up each role.**
  - Each gets a welcome notification and email.
  - The vendor and rider go through onboarding. The admin verifies them in Admin → Verifications.
- [ ] **Order and pay.** The customer orders and pays with a real card.
  - The order becomes paid and the vendor gets "New order".
  - The customer gets "Payment confirmed" and an email.
- [ ] **Close the tab straight after paying** on a second order. It should still become paid, which shows the webhook works.
- [ ] **Vendor steps.** The vendor accepts, then marks the order ready. The rider (online, within 5 km) gets "Order nearby" and can accept it.
- [ ] **Handover.**
  - The rider taps **Head to vendor** and shows the pickup code, and the vendor enters it.
  - The rider enters the customer's delivery code, and the order becomes **Delivered**.
- [ ] **Payouts.**
  - The vendor's and rider's wallets are credited.
  - The order shows on **Admin → Money → Earnings**, and the row adds up.
- [ ] **Refunds.** Cancel a paid pending order as the customer, and reject a paid order as the vendor. Both refund to the customer's wallet, with a notification and an email.
- [ ] **Admin cancel.** As the admin, **Cancel & refund** an order from its order page.
- [ ] **Withdrawal.**
  - The vendor withdraws a small amount, and the admin approves it in **Admin → Money → Withdrawals**.
  - The money arrives in the bank, and **Check status** shows it as paid.
- [ ] **Request a Rider.** The vendor sends a parcel with **Request a Rider**.
- [ ] **Admin invite.** Invite a second admin from **Admin → Users**. They set a password from the email and can log in.
- [ ] **Install the app.**
  - On an Android phone, use the **Install** banner. On an iPhone, use **Share → Add to Home Screen**.
  - Check it opens full screen with the Cydex icon, and that push notifications arrive on both.

---

## 10. After launch

- [ ] **Check daily** the admin Overview's **To do** list: verifications to review, withdrawals to approve, stuck orders and failed emails.
- [ ] **Check weekly:**
  - Supabase → Edge Functions → Logs for `squad-webhook` and `squad-payout` errors
  - The Squad balance (enough for the week's withdrawals)
  - Google Cloud billing
- [ ] **Decide who handles support cases:** withdrawals, locked handover codes, stuck deliveries, refunds and suspensions. The tools are in the admin ([ADMIN.md](ADMIN.md)).
