# Cydex App To-Do

Open work for the Cydex app, grouped by who it's for, as of September 2026. Within each group, items are in priority order.

Tick an item (`[x]`) when it ships, or remove it and note it in the relevant doc.

Everything needed to go live (accounts, environment variables, Supabase settings, Squad live mode, emails, hosting, launch test) is in [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md).

## General

- [ ] **Use Cydex's own Google Maps API key.** The current key (`VITE_GOOGLE_MAPS_API_KEY`) belongs to the Faramove project, so Cydex's map usage is billed there.
  - Create a key in Cydex's Google Cloud project with Places API (New), Maps JavaScript API and Geocoding API enabled.
  - Restrict it to Cydex's web addresses.
  - Update `.env` and the Vercel environment variables.
- [ ] **Move the Supabase settings into environment variables.** The Supabase URL and key are written into the code (`src/integrations/supabase/client.ts`, `src/lib/supabase.ts`) instead of read from `.env`.
  - The key in there is the public anon key, which is safe in the browser.
  - Make sure no secret key, such as the `service_role` key, ever goes into the code or a `VITE_` variable. Anything named `VITE_` is visible to anyone using the site.
- [ ] **Rider and vendor onboarding and verification.** Make each account's verification status visible to them and to admins, and decide what an unverified account can't do.
  - **Riders:** verify their **NIN**, **address** and **vehicle**. More checks will be added later. The verified vehicle type is also the starting point for eco-friendly rewards (see [Eco-friendly deliveries](#eco-friendly-deliveries)).
  - **Vendors:** decide what they need to submit and who reviews it.
  - **Today:** riders have `is_verified` and `verification_status` fields plus a document upload. Vendors only have a `verified` flag. Nothing defines who reviews them.
- [ ] **Push the order-flow and wallet changes live.** Run from the repo, logged in to the Supabase CLI:
  1. `npx supabase db push --linked` (migrations `20260930000000_order_flow.sql` and `20260930100000_wallets_server_side.sql`), then `npx supabase gen types typescript --linked > src/integrations/supabase/types.ts`
  2. `npx supabase functions deploy squad-checkout squad-webhook squad-payout send-emails`
  3. `npx supabase secrets set SQUAD_SECRET_KEY=<sandbox secret key> SQUAD_API_URL=https://sandbox-api-d.squadco.com SQUAD_MERCHANT_ID=<merchant id> APP_URL=<site URL>`. Use the live key and `https://api-d.squadco.com` in production.

  Until this is done, checkout and withdrawals don't work.
- [ ] **Set the Squad webhook URL.** In the Squad dashboard, set the webhook to `https://hsnguuozyigpzstwqkrk.supabase.co/functions/v1/squad-webhook`. Without it, a payment is only confirmed if the customer returns to the confirmation page after paying.
- [ ] **Set up sending emails.** Welcome, payment-confirmed and refund emails are queued in `email_outbox` but nothing sends them yet.
  - Create a [Resend](https://resend.com) account (or choose another provider, which means changing `supabase/functions/send-emails`), and verify Cydex's sending domain.
  - `npx supabase secrets set RESEND_API_KEY=... EMAIL_FROM="Cydex <hello@your-domain>" EMAIL_CRON_SECRET=<long random string>`
  - Schedule `send-emails` every minute with pg_cron + pg_net, sending the `x-cron-secret` header.
- [ ] **Move virtual account creation server-side.** Payments and withdrawals now use the Squad secret key only on the server, but creating virtual accounts (`walletSetupService`, `squadVirtualAccountService`) still uses it in the browser. Move that to an Edge Function, then remove `VITE_SQUAD_SECRET_KEY` / `VITE_SQUAD_PROD_SECRET_KEY` and rotate the live key that is written in `src/config/squad.ts`.

## Customers

- [ ] **Push notifications:** order updates on the phone without keeping a browser tab open. In-app notifications already exist (see [ORDER_FLOW.md → Notifications](ORDER_FLOW.md#notifications)); this is about delivering them when the app is closed.
- [ ] **Wallet top-up:** a way to add money to the wallet beyond card and bank transfer.
- [ ] **Schedule pickup:** choose a later time for the order to be collected and delivered, instead of right away. An unused scheduler dialog already exists (`DeliveryScheduler.tsx`), but it still has a free-text address box and the old ₦500 fee.

## Vendors

- [ ] **Push notifications:** alerts for new incoming orders when the app is closed (in-app notifications already exist).
- [ ] **In-app subscriptions:** vendors pay a monthly subscription fee to access services for their business.
- [ ] **Off-app order entry:** bring WhatsApp and phone orders into the same records as app orders.
- [ ] **Direct rider access:** assign off-app orders to Cydex riders. Available only to subscribed vendors.

## Riders

- [ ] **Automatic assignment:** offer each order to one specific rider with a time limit to accept, instead of leaving it in a shared pool.
- [ ] **Automatic reassignment:** a rejected or timed-out order goes straight to the next nearby rider.
- [ ] **Repayment visibility:** show the weekly hire-purchase deduction and the weeks left until the rider owns their bicycle, in Earnings.
- [ ] **Scheduled pickups:** see and accept scheduled pickups in advance, with a reminder before the pickup time. Goes with the customer **Schedule pickup** above.
- [ ] **Order distance limits by vehicle:** how far an order a rider can take depends on their vehicle.

  | Vehicle | Limit |
  |---|---|
  | Walking | 1.5 km |
  | Bicycle | 7 km |
  | Any other vehicle (for example an electric bike or motorcycle) | 20 km, the maximum |

  - **For now, every rider uses 5 km**, set in `rider_order_radius_m()` (see [PRICING_MODEL_IMPLEMENTATION_PLAN.md → Rider radius](PRICING_MODEL_IMPLEMENTATION_PLAN.md#rider-radius-5-km)).
  - The limit should come from the vehicle verified at onboarding, not the one the rider picks in their profile.
  - **To decide:** measure the limit from the rider to the pickup (as the 5 km rule does today), over the delivery itself (pickup to drop-off), or both.

## Admin

- [x] **Payout approval:** done. Every withdrawal waits for an admin (Admin → Money → Withdrawals). See [ADMIN.md](ADMIN.md#withdrawals-need-an-admin).
- [ ] **Hire-purchase ledger:** weekly deductions and weeks remaining to ownership for every financed bicycle.
- [ ] **Manual order entry:** put WhatsApp and phone orders into the same records as app orders.
- [x] **Fare settings screen:** done (Admin → Pricing, with history). See [ADMIN.md → Pricing](ADMIN.md#pricing).
- [x] **Delivery intervention:** stuck orders are flagged on the Overview; admins can relieve or reassign the rider, unlock codes, and cancel and refund. Disputes still need a process (who decides, and what evidence).
- [x] **Platform-wide reporting:** Overview (with period filter) and the Earnings breakdown with CSV export.
- [ ] **Admin settings page:** the admin's own profile and password in one place (invites already work from Admin → Users).

## Eco-friendly deliveries

Riders who deliver on eco-friendly vehicles (for example a bicycle, on foot, or an electric vehicle) earn extra. For that to be fair, the vehicle has to be confirmed on every delivery, not just claimed by the rider.

- [ ] **Vehicle confirmation at pickup and drop-off (required):** the people who hand over and receive the order confirm what the rider came on.
  - **Vendor:** answers when handing the order to the rider.
  - **Customer:** answers at drop-off or in the rating step.
  - **Both answers are compulsory.** The handover or delivery can't be completed without them, otherwise eco rewards would go to riders who didn't earn them.
  - Fits with the pickup and delivery handover codes (see [ORDER_FLOW.md → Handover codes](ORDER_FLOW.md#handover-codes)), which happen at the same moments.
  - A rider's eco status for a delivery only counts when it matches the vehicle verified at onboarding.
- [ ] **Eco-vehicle bonus for riders:** extra pay for deliveries confirmed as eco-friendly. The amount is still to be decided.
  - This replaces the old flat 5% "eco bonus", which every rider got whatever their vehicle and which was removed in September 2026.
  - The `deliveries.eco_bonus` and `rider_earnings.eco_bonus` columns already exist for it.
- [ ] **Carbon offset calculation:** work out the carbon saved on each confirmed eco-friendly delivery, and turn it into eco points.
  - For example: distance × the emissions of a typical petrol motorbike, minus the eco vehicle's emissions (zero for a bicycle or on foot).
  - The emission figures are still to be decided.
  - Only confirmed deliveries count.
  - Unused columns already exist for the results: `deliveries.carbon_saved`, `orders.carbon_credits_earned`, `rider_earnings.carbon_credits_earned` and `profiles.carbon_credits`.

## Already done

These were on the original list and are now live, so they've been left out above:
- **Pin-drop addresses** for customers, and store locations for vendors (see [ADDRESS_HANDLING.md](ADDRESS_HANDLING.md)).
- **Rider availability** worked out from their live location, with no manual online/offline toggle.
- **Distance-linked rider pay:** riders get 85% of the delivery fee, which is the higher of ₦600 or ₦200 per km.
- **Order flow** (see [ORDER_FLOW.md](ORDER_FLOW.md)):
  - handover codes: the rider's pickup code for the vendor, and the customer's delivery code for the rider
  - in-app notifications for every order step, with unread badges
  - refunds to the wallet on cancellation or rejection
  - payment confirmation on the server
- **Request a rider (vendors):** vendors send a rider to deliver orders their customers placed with them directly, paying the delivery fee plus 10% from their wallet (card for any shortfall), with saved customers. See [ORDER_FLOW.md → Request a rider](ORDER_FLOW.md#request-a-rider).
- **Rider dashboard and profile:** delivery preferences and the weekly schedule are gone (Cydex sets the order radius). The dashboard shows Recent deliveries, with **See all** going to My Deliveries.
- **Vendor and rider verification:** onboarding, review screens, admin approvals with reasons, verified badges and business categories ([VERIFICATION.md](VERIFICATION.md)).
- **Notification settings and push notifications,** with a reminder banner for vendors ([NOTIFICATIONS.md](NOTIFICATIONS.md)).
- **Installable app (PWA):** install banner and menu item, app icons, splash screens, offline page ([INSTALLABLE_APP.md](INSTALLABLE_APP.md)).
- **Admin order tools:** relieve a rider or reassign an order ([ORDER_FLOW.md → Admin tools](ORDER_FLOW.md#admin-tools)).
- **Admin update (8 Oct 2026):** Overview with real figures and a period filter, full order details, cancel and refund, withdrawal approval, earnings breakdown, pricing settings, customer suspension, review hiding, email retries, activity log and admin invites ([ADMIN.md](ADMIN.md)).
- **Wallet balances are only changed by the database.** Users can read their wallet but not write it. Withdrawals go through `request_payout` (checks and deducts the balance) and the `squad-payout` Edge Function (sends the transfer, and puts the money back if it fails).



# New checklist

> **Built on 7 Oct 2026:** all three items below. See [VERIFICATION.md](VERIFICATION.md), [NOTIFICATIONS.md](NOTIFICATIONS.md) and [ORDER_FLOW.md → Admin tools](ORDER_FLOW.md#admin-tools). One choice differs from the note below: vendors are **reminded** to turn on push (a banner), not blocked, because iPhones can only receive push once the app is added to the Home Screen.

- Lets handle vendor and rider verification. they cannot login directly after signup, they should be taken to their onboarding pages. Vendors onboarding page info to collect:  Store name (which is what customers see - update where necessary), Phone number, store logo and banner (also seen in their settings page), Business Category (a list added from the admin - factor this in in the admin too - for now the only thin on the list is Restaurant), Is this a registered Business (yes/no), If yes - Upload Business License (field to upload file) Then they submit. For those who Uploaded the file they are redirected to an awaiting verification screen, let them know they should watch their emails for the verification. When they try to login without being verified - if still pending, they are redirected to that screen. If they were rejected they will be redirected to a rscreen telling they have being rejected and they can edit their verification response to change back to pending. Vendors that do not upload document are given access to the dashboard immediately after onboarding - but they will be unverified - Customers can see this too

Admin must give reason if rejection - lets create interface on admin to handle the verification too (for both riders and vendors). Verified vendors have a verification badge, which customers can see also to order from verified vendors.

Verification flow for riders follows the same process, but details to collect are: Address, Phone number, Vehicle info (type, model, year, color, registration - if available), Government issued Id document - National ID/Passport/Voters card/Drivers License.  Riders have to be verified to have access to the dashboard

Verification status: pending, verified, unverified, rejected, suspended (this also has its own screen for redirection at login)

- On the settings page (preferences) we can have the email notifications and push notifications toggle. email toggle should be automatically turned on for new accounts, and push notification can be turned on (this is where we can also update the browser permission accordingly). For all 3 user types, when they go to their notification module they can also see a check to allow push notifications. For vendors, push notifications should be enforced just like location is for the riders, they have to turn it on so they dont miss customer orders.

- Admin feature for orders: admin can reassign orders, admin can also relieve rider of order (so its available back in the pool of available orders, with highest priority)