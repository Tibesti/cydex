# Pricing and Order Dispatch

How Cydex prices orders, how the money is split, which vendors customers can order from, and which riders see an order, as of September 2026.

This doc replaces the two earlier plans, `PRICING_IMPLEMENTATION_PLAN.md` and the previous version of this file. The earlier tiered-pricing model is summarised under [Earlier ideas](#earlier-ideas-not-current-decisions).

## Current decisions

| Decision | Value |
|---|---|
| Delivery fee | **The higher of ₦600 or ₦200 × km.** ₦600 is a minimum fare, not added on top. Straight-line distance from the vendor's store to the customer's delivery address. |
| Service Charge (customer) | **15% of the items total.** Shown to customers as an amount only, never the percentage. |
| Vendor commission | **10% of the items total**, and nothing else is taken from vendors |
| Rider pay | **85% of the delivery fee.** Cydex keeps 15%. There's no eco bonus. |
| Rounding | **None:** exact figures, to the kobo |
| Item prices | **From the database** (`products`), never from the app |
| Customer radius | Customers only see, and can only order from, vendors **within 5 km** of their delivery address |
| Rider radius | Riders only see, and can only accept, orders whose pickup is **within 5 km** of their live location |
| Rider online status | **Automatic.** Online while the rider's live location is coming through, offline once it stops |

## What the customer pays

```
delivery fee   = the higher of ₦600 or ₦200 × distance (km)
service charge = 15% × items total
total          = items total + service charge + delivery fee
```

- **Distance** is straight-line, from the vendor's store address to the customer's chosen delivery address, to the nearest 10 m (2 decimal places in km).
- **Anything up to 3 km costs the ₦600 minimum.** Beyond 3 km it's ₦200 per km.
- **Every amount is exact**, to the kobo.

| Items | Distance | ₦200 × km | Delivery fee | Service Charge | Total |
|---|---|---|---|---|---|
| ₦3,000 | 2.50 km | ₦500 | **₦600.00** (minimum) | ₦450.00 | **₦4,050.00** |
| ₦1,234 | 3.00 km | ₦600 | **₦600.00** | ₦185.10 | **₦2,019.10** |
| ₦5,000 | 4.80 km | ₦960 | **₦960.00** | ₦750.00 | **₦6,710.00** |

### Where customers see it
Each of these shows **Items, Service Charge, Delivery (x km), Total** using [`PriceBreakdown.tsx`](../src/components/customer/PriceBreakdown.tsx):
- **Cart:** priced for the default address ([`ShoppingCartSidebar.tsx`](../src/components/customer/ShoppingCartSidebar.tsx)).
- **Checkout, "Deliver to" step:** priced for whichever saved address is selected. **Deliver here** is disabled if the vendor is over 5 km away or has no store location ([`ConfirmDeliveryAddressDialog.tsx`](../src/components/customer/address/ConfirmDeliveryAddressDialog.tsx)).
- **Order detail:** the stored amounts ([`OrderSummary.tsx`](../src/components/customer/OrderSummary.tsx)).

There's no separate Pricing page in the customer app.

### How orders are priced
Everything is calculated in the database. The app only sends **product IDs and quantities**. Migrations:
- [`20260925220000_pricing_and_availability.sql`](../supabase/migrations/20260925220000_pricing_and_availability.sql)
- [`20260925230000_server_prices_and_split.sql`](../supabase/migrations/20260925230000_server_prices_and_split.sql)

- **Settings** live in `pricing_config`. Change them there, with no code change; there's no admin screen yet.

  | Column | Value | Meaning |
  |---|---|---|
  | `base_rate` | 600 | Minimum delivery fee |
  | `distance_rate_per_km` | 200 | Price per km |
  | `service_charge_rate` | 0.15 | Customer Service Charge |
  | `vendor_commission_rate` | 0.10 | Cydex's cut of the items total |
  | `rider_share_rate` | 0.85 | Rider's cut of the delivery fee |
- **`quote_order(vendor, address, items)`:** the price shown before paying ([`useOrderQuote.ts`](../src/hooks/useOrderQuote.ts)). It prices items from `products`, and returns a status:
  - `ok`
  - `out_of_range` (over 5 km)
  - `no_store` (the vendor has no store location)
  - `no_address`
- **`place_order(vendor, address, items)`:** the only way to create an order ([`NewOrder.tsx`](../src/pages/customer/NewOrder.tsx), `createOrderWithAddress`). In one step it:
  - checks every product belongs to the vendor, is active, and has a quantity of at least 1
  - prices the items from `products`
  - copies the delivery address, with the customer's phone
  - creates the order and its `order_items` (each linked to its `product_id`)
- **`price_new_order` trigger:** then fills in the delivery fee, Service Charge and total. It **rejects the order** if the address isn't the customer's, the vendor has no store location, or the vendor is more than 5 km away.
- **Customers can't write to `orders` or `order_items` directly**; their access rules for that were removed. After an order is placed, only admins can change its prices or delivery address (`protect_order_prices`).
- **Squad** charges the order's `total_amount`, as stored by the database.

## How the money is split

Settled when the order is delivered (`calculate_settlement_amounts`, `process_order_settlement`).

| Who | Gets | ₦3,000 items, ₦960 delivery (4.8 km) |
|---|---|---|
| Vendor | Items total minus 10% commission | ₦3,000 − ₦300 = **₦2,700** |
| Rider | 85% of the delivery fee | 85% × ₦960 = **₦816** |
| Cydex | Service Charge + vendor commission + 15% of the delivery fee | ₦450 + ₦300 + ₦144 = **₦894** |
| **Customer paid** | | **₦4,410** |

- **When the customer pays,** the full amount is held in `payment_holds` until delivery.
- **Records are gross, fee, then net:**
  - Vendor transactions show the items total, Cydex's commission as the fee, and the vendor's net amount.
  - Rider transactions show the full delivery fee, Cydex's 15% as the fee, and the rider's 85%.
- **Riders see their own share.** Each delivery stores `rider_earning` (85% of the fee), and the rider screens show that instead of the full fee.
- **The old 5% "eco bonus" has been removed.** It was an extra 5% of the delivery fee that Cydex paid riders on every delivery, whatever vehicle they used. `deliveries.eco_bonus` and `rider_earnings.eco_bonus` stay at 0 for now.
- **A new bonus is planned** for deliveries where the vendor and customer confirm the rider used an eco-friendly vehicle. See [APP_TODO.md → Eco-friendly deliveries](APP_TODO.md#eco-friendly-deliveries).

## Customer radius (5 km)

- **Customers only see vendors within 5 km** of their default delivery address, the one shown in the "Deliver to" bar. The list is sorted nearest-first and each card shows the distance ([`VendorSelectionPage.tsx`](../src/components/customer/VendorSelectionPage.tsx)).
- **Switching address** in the "Deliver to" bar reloads the list for the new address.
- **Customers with no saved address** are asked to add one before any vendors are shown.
- **Vendors with no store location** never appear.
- **How it's enforced:**
  - `vendors_near_address(address)` returns only vendor IDs and distances, never the vendors' coordinates.
  - `price_new_order` blocks orders over 5 km, so a customer can't get around the list.
  - The radius is set in `customer_vendor_radius_m()` (5000 m).

## Rider radius (5 km)

- **A rider only sees, and can only accept, orders whose pickup** (the vendor's store) **is within 5 km of their live location.**
- Orders already assigned to a rider stay visible to that rider wherever they go.
- **A rider sees no available orders if** they have no live location yet.
- **Positions:** the rider's comes from `rider_profiles.current_location`; the pickup's from `deliveries.pickup_location`.
- **Enforced in the database's access rules,** migration [`20260925180000_rider_order_radius.sql`](../supabase/migrations/20260925180000_rider_order_radius.sql). The radius is set in `rider_order_radius_m()` (5000 m).
- **5 km is temporary.** Limits by vehicle are planned: 1.5 km walking, 7 km bicycle, 20 km for any other vehicle. See [APP_TODO.md → Riders](APP_TODO.md#riders).
- **Order lists** show the real distance to pickup, the rider's earning, and sort nearest-first.

## Rider online status

The manual online/offline toggle is gone. The dashboard and profile show a read-only badge.

- **Online:** each time the rider app saves the live location, it sets `rider_profiles.rider_status = 'available'`.
- **Heartbeat:** while the app is open, it re-saves the location every 60 seconds even if the rider hasn't moved.
- **Offline:**
  - A scheduled database job, `mark-stale-riders-offline` (pg_cron, every minute), sets `rider_status = 'offline'` once the saved location is **more than 2 minutes old**.
  - The app also sets offline straight away when location is blocked or the rider leaves the rider screens.
- **Riders must allow location to use the app** (see [ADDRESS_HANDLING.md → Riders](ADDRESS_HANDLING.md#riders)).

## Things to know

- **Straight-line distance is shorter than the road route**, so riders on winding routes earn a little less per real km.
- **A rider could fake their location** with GPS-spoofing tools or by writing to `current_location` directly. A web app can't fully prevent that.
- **The 5 km rules measure different legs.** The rider rule is rider to pickup; the customer rule is pickup to drop-off. So a single delivery can be up to about 10 km of riding.
- **Dead code still shows the old flat ₦500:**
  - The delivery scheduler dialog (`DeliveryScheduler.tsx`) is never opened.
  - `PricingCalculator.tsx`, `pricingService.ts` and `SubscriptionForm.tsx` aren't used anywhere.
  - `DELIVERY_FEE` in `src/constants/delivery.ts` is only used by mock and sample data.

## Earlier ideas (not current decisions)

The earlier plans proposed a tiered model. None of it is live or decided. The matching columns exist in `pricing_config` and `orders` but aren't used:

| Idea | Earlier proposal | Columns |
|---|---|---|
| Base + distance | ₦200 for the first 2 km, then ₦75/km | Superseded by the higher of ₦600 or ₦200/km |
| Weight | +₦100 for 0.5–5 kg, +₦300 for 5–10 kg | `weight_rates`, `orders.weight_fee`, `weight_kg` |
| Late night (8 PM–6 AM) | +₦100 | `late_night_fee`, `orders.is_late_night` |
| Peak hours (12–2 PM) | ×1.2 | `surge_multiplier`, `orders.surge_fee`, `is_peak_hour` |
| UI student discount | 10% off for `@ui.edu.ng` emails | `student_discount_percent`, `orders.student_discount`, `is_student_order` |
| Student subscription | ₦1,000/month for unlimited deliveries | `subscription_monthly_rate`, `student_subscriptions` table |
| Green fee | Optional ₦20 | `green_fee` |

The earlier plans also described Next.js API routes and Paystack. This app uses Vite, which has no API routes, and pays through Squad.
