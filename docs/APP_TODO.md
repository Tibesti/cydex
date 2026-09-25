# Cydex App To-Do

Open work for the Cydex app, grouped by who it's for, as of September 2026. Within each group, items are in priority order.

Tick an item (`[x]`) when it ships, or remove it and note it in the relevant doc.

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
- [ ] **Move Squad secret-key calls to server-side code.** Payments, virtual accounts and payouts currently use the Squad secret key in the browser, where anyone can read it. Move those calls to Supabase Edge Functions, and rotate the live key that is written in `src/config/squad.ts`.

## Customers

- [ ] **Push notifications:** order accepted, rider assigned, rider arriving, without keeping a browser tab open.
- [ ] **Installable app:** a progressive web app (PWA) that sits on the phone's home screen, not a browser bookmark.
- [ ] **Receipt code:** the customer gets a code and gives it to the rider on arrival, confirming the delivery happened. See the rider's **Delivery code** below; it's the same feature from the other side.
- [ ] **Wallet top-up:** a way to add money to the wallet beyond card and bank transfer.
- [ ] **Schedule pickup:** choose a later time for the order to be collected and delivered, instead of right away. An unused scheduler dialog already exists (`DeliveryScheduler.tsx`), but it still has a free-text address box and the old ₦500 fee.

## Vendors

- [ ] **Handover code:** the rider confirms collection with a code from the vendor, instead of pressing a button, so it's clear the parcel actually reached the rider.
- [ ] **Push notifications:** alerts for new incoming orders without watching an open browser tab.
- [ ] **In-app subscriptions:** vendors pay a monthly subscription fee to access services for their business.
- [ ] **Off-app order entry:** bring WhatsApp and phone orders into the same records as app orders.
- [ ] **Direct rider access:** assign off-app orders to Cydex riders. Available only to subscribed vendors.

## Riders

- [ ] **Automatic assignment:** offer each order to one specific rider with a time limit to accept, instead of leaving it in a shared pool.
- [ ] **Automatic reassignment:** a rejected or timed-out order goes straight to the next nearby rider.
- [ ] **Delivery code:** the rider enters the code the customer gives them to complete a delivery. **Partly built, but not working:**
  - A 4-digit code is generated when a rider is assigned and sent to the customer.
  - The rider's order screen shows that code to the rider.
  - The dashboard's code check compares against a placeholder, `"1234"`.

  It needs checking in the database, and the code hidden from riders.
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

- [ ] **Payout approval:** approve rider and vendor payout requests in one place.
- [ ] **Hire-purchase ledger:** weekly deductions and weeks remaining to ownership for every financed bicycle.
- [ ] **Manual order entry:** put WhatsApp and phone orders into the same records as app orders.
- [ ] **Fare settings screen:** change the minimum fare, per-km rate, Service Charge, vendor commission and rider share without a developer. The values already live in the `pricing_config` table (see [PRICING_MODEL_IMPLEMENTATION_PLAN.md](PRICING_MODEL_IMPLEMENTATION_PLAN.md)), but they can only be changed in the database today.
- [ ] **Delivery intervention:** reassign a stuck delivery and resolve disputes.
- [ ] **Platform-wide reporting:** the combined view of orders and revenue that riders and vendors already get for their own accounts.

## Eco-friendly deliveries

Riders who deliver on eco-friendly vehicles (for example a bicycle, on foot, or an electric vehicle) earn extra. For that to be fair, the vehicle has to be confirmed on every delivery, not just claimed by the rider.

- [ ] **Vehicle confirmation at pickup and drop-off (required):** the people who hand over and receive the order confirm what the rider came on.
  - **Vendor:** answers when handing the order to the rider.
  - **Customer:** answers at drop-off or in the rating step.
  - **Both answers are compulsory.** The handover or delivery can't be completed without them, otherwise eco rewards would go to riders who didn't earn them.
  - Fits with the vendor **Handover code** and customer **Receipt code** above, which happen at the same moments.
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
