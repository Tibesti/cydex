# Order Flow

How an order moves from checkout to delivery: the statuses, who can change them, the handover codes, refunds, and the notifications each step sends. As of September 2026.

Everything here is enforced in the database, migration [`20260930000000_order_flow.sql`](../supabase/migrations/20260930000000_order_flow.sql). The app calls one database function per step ([`src/services/orderActions.ts`](../src/services/orderActions.ts)); nobody can write `orders.status`, `payment_status` or `rider_id` directly except admins.

## Statuses

The same status names are used for customers, vendors and riders. Each screen just shows the part that matters to that person.

| # | Status | Label in the app | What it means | Who moves it here |
|---|---|---|---|---|
| 1 | `pending` | Pending | Order placed. Until it's paid, only the customer can see it. | Customer (checkout) |
| 2 | `accepted` | Accepted | The vendor has accepted the paid order and is preparing it. **Both handover codes are created now.** | Vendor |
| 3 | `ready_for_pickup` | Ready for pickup | Ready to collect. Online riders within 5 km are notified and it appears in their Available Orders. | Vendor |
| 4 | `rider_assigned` | Rider assigned | A rider has accepted it. | Rider |
| 5 | `picking_up` | Rider heading to vendor | The rider is on the way to the vendor. | Rider |
| 6 | `out_for_delivery` | Out for delivery | The vendor handed it over, confirmed with the rider's **pickup code**. | Vendor (with code) |
| 7 | `delivered` | Delivered | The rider handed it over, confirmed with the customer's **delivery code**. The vendor and rider are paid now. | Rider (with code) |
| – | `cancelled` | Cancelled | Cancelled by the customer before the vendor accepted. | Customer |
| – | `rejected` | Rejected | Rejected by the vendor before a rider accepted. | Vendor |

```
pending ─► accepted ─► ready_for_pickup ─► rider_assigned ─► picking_up ─► out_for_delivery ─► delivered
   │           │               │                 (rider_assigned can go straight to out_for_delivery
   │           └───────────────┴─► rejected       if the vendor enters the pickup code first)
   └─► cancelled
```

Old status names (`processing`, `ready`, `picked_up`, `delivering`, `completed`) were converted by the migration and are no longer allowed.

### Payment status

| `payment_status` | Meaning |
|---|---|
| `pending` | Not paid yet |
| `paid` | Squad confirmed the payment. The vendor can now see and accept the order. |
| `failed` | Payment failed; the customer can try again |
| `refunded` | Cancelled or rejected after payment; the total went back to the customer's wallet |

Vendors only see orders whose payment is `paid` or `refunded`. Unpaid orders stay invisible to them.

## Who can do what, and when

| Action | Who | Allowed when | Function |
|---|---|---|---|
| Accept | Vendor | `pending` and paid, and the vendor has a **phone number** on their profile | `vendor_accept_order` |
| Mark ready | Vendor | `accepted` | `vendor_mark_ready` |
| Reject (with an optional reason) | Vendor | `pending`, `accepted` or `ready_for_pickup`, and **no rider yet** | `vendor_reject_order` |
| Cancel | Customer | `pending` only (before the vendor accepts) | `customer_cancel_order` |
| Accept delivery | Rider | `ready_for_pickup`, no rider yet, pickup within 5 km of the rider, the rider has **no other active delivery**, and has a **phone number** on their profile | `rider_accept_order` |
| Head to vendor | Rider | `rider_assigned` | `rider_start_pickup` |
| Confirm pickup (enter the rider's code) | Vendor | `rider_assigned` or `picking_up` | `vendor_confirm_pickup` |
| Confirm delivery (enter the customer's code) | Rider | `out_for_delivery` | `rider_confirm_delivery` |

**Phone numbers are required** so people can call each other during a delivery:
- **Vendors** without one see a notice on their order screens linking to Settings, and their Accept buttons are disabled (migration [`20260930200000_vendor_phone_required.sql`](../supabase/migrations/20260930200000_vendor_phone_required.sql)).
- **Riders** without one see a notice on the dashboard and Available Orders linking to Profile → Personal, and their Accept buttons are disabled (migration [`20260930300000_rider_phone_required.sql`](../supabase/migrations/20260930300000_rider_phone_required.sql)).
- **Customers** see their rider's name, what they're doing and a **Call** button once a rider accepts, just below their delivery code.

What the rider sees:
- **Before accepting** (order details pop-up from Available Orders): the vendor's name, full store address and phone; the customer's full delivery address with any directions; the items without prices; and their earnings (delivery fee, Cydex's cut, what they'll receive).
- **With the pickup code** (Current Deliveries, the dashboard and the order page): the vendor's name, full store address, directions and a tap-to-call phone number.

Each function checks that the order belongs to the caller. If a step isn't allowed, it fails with a plain message such as "Orders can only be cancelled before the vendor accepts them", which the app shows as-is.

## Products and stock

Stock is optional for each product (migration [`20261001000000_product_stock.sql`](../supabase/migrations/20261001000000_product_stock.sql)).

| | **Track stock** ticked | **Track stock** not ticked |
|---|---|---|
| Stock number | Required | None |
| Available to customers | While stock is above 0. At 0 it shows **Out of stock** automatically. | When the vendor's **Available** switch is on |
| Vendor controls | Edit the product to restock | The **Available** switch on the Products page, or on the edit page |

- **Stock goes down when an order is paid for**, not when it's placed, so unpaid orders don't hold stock.
- **Stock goes back up** if a paid order is cancelled by the customer or rejected by the vendor.
- **Customers can't order more than is in stock.** Checkout fails with "Only 3 of Jollof left. Reduce the quantity in your cart."
- **Unavailable products still show to customers**, greyed out and labelled "Out of stock" or "Unavailable", with Add to cart disabled. Available products are listed first.
- **Two customers can both check out the last item** if neither has paid yet. Whoever pays second takes the stock to 0 (it never goes negative), and the vendor can reject that order to refund it.

## Ratings

Migration [`20261001100000_storefront_and_ratings.sql`](../supabase/migrations/20261001100000_storefront_and_ratings.sql).

- **Vendors:** customers rate a vendor from the vendor's page with **Rate vendor**, or from the Orders page.
  - The button appears when the customer has a **delivered** order from that vendor that they haven't rated. That rule is enforced in the database.
  - It's one rating per order.
  - Vendors see their ratings and reviews in Settings → Ratings, and the average shows on their cards and store page.
- **Riders:** customers rate the rider of a **delivered** order, one rating per order. The rider's average is kept in `rider_profiles.rating`.
  - **Pop-up at login:** once per session, the customer is asked to rate the rider of their **most recent delivered order**. It doesn't show if they've already rated that rider, or if they closed the pop-up for that order before (stored in `rider_rating_prompt_dismissals`). When a newer order is delivered, that order is the one asked about.
  - **On the order page:** delivered orders show **Rate your rider** until the rider has been rated.
  - Riders can read their own ratings. Vendors can't see them.

## Customer home and vendor pages

- **Home** shows three sections for the customer's delivery address (within 5 km): **Vendors nearby** (closest 4), **Popular vendors** (most paid orders in the last 30 days, top 4), and **Other vendors** (everyone else). It also has a **See all vendors** button to the full list.
- **Vendor cards and the vendor's page** show the store banner and square logo, store name, Verified or Unverified, rating, distance, and the store address (as text; coordinates are never sent).
- **Logo and banner:** vendors upload them in Settings → Account, into the public `store-images` storage bucket in their own folder. The logo is also their profile photo.
- **One vendor per order:** adding an item from a different vendor than the one in the cart opens a dialog with **Keep current cart** or **Start new cart**. Browsing other vendors doesn't empty the cart, and checkout always uses the cart's vendor.

## Request a rider

For orders a vendor's customer placed with them directly (by phone, WhatsApp or in person), the vendor can ask Cydex for a rider: sidebar → **Request Rider**. Migration [`20261001200000_rider_requests.sql`](../supabase/migrations/20261001200000_rider_requests.sql).

1. **The vendor enters the customer's details:** name, phone, delivery location (pin-drop map), optional directions, and what's being delivered. They can pick a **saved customer** or tick "Save this customer" (table `vendor_customers`).
2. **Price:** the same delivery fee as customer orders (the higher of ₦600 or ₦200 × km from the store, up to 5 km), **plus a 10% commission on it**. The rate is `pricing_config.rider_request_commission_rate`.
3. **Payment:** the vendor's **wallet** pays first.
   - If it covers the whole amount, the request goes live immediately.
   - Otherwise the rest is paid **by card** (the squad-checkout function charges only that part), and the request goes live when Squad confirms.
4. **Live = `ready_for_pickup`.** Nearby riders are notified, and a rider accepts it like any order. They see "A package from the vendor" with the vendor's description instead of an item list, and the customer's phone and directions.
5. **Delivery code:** the **vendor** sees the delivery code and sends it to their customer. The rider enters it on arrival to complete the delivery. Pickup works as normal, with the rider's pickup code entered by the vendor.
6. **Money:** on delivery, the rider gets the usual 85% of the delivery fee. Cydex keeps the other 15% plus the commission. Nothing is credited to the vendor.

| Example (₦1,000 delivery fee) | |
|---|---|
| Vendor pays | ₦1,100 |
| Rider gets | ₦850 |
| Cydex keeps | ₦150 + ₦100 = ₦250 |

- **Cancelling:** the vendor can cancel until a rider accepts. Everything they paid goes back to their wallet. A card payment that lands after cancelling is refunded too, without returning the wallet part twice.
- **Where they appear:** requests are an order type (`orders.order_type = 'rider_request'`, no customer account). They're kept out of the vendor's Orders list and stats and only appear under Request Rider. Customers never see them.

## Handover codes

Two 4-digit codes are created when the vendor accepts an order (table `order_handover_codes`).

| Code | Shown to (gives it) | Entered by (receives it) | Moves the order to |
|---|---|---|---|
| **Pickup code** | Rider, on their order screens once they accept the delivery | Vendor, after tapping **Hand to rider** | `out_for_delivery` |
| **Delivery code** | Customer, on the order detail page once the vendor accepts | Rider, after tapping **Complete delivery** | `delivered` |

- **Only the giver can see each code.** The database only returns the pickup code to the order's rider and the delivery code to the order's customer. The vendor never sees either, and the rider never sees the delivery code.
- **A wrong code changes nothing.** The screen says it's incorrect; after **5 wrong tries** the code is locked and the order needs support.
- Once used, the code card shows that the handover was confirmed.
- The old single `verification_code` (shown to riders, checked against a hardcoded "1234") has been removed.

## Payment confirmation

Squad calls now happen on the server, in Supabase Edge Functions ([`supabase/functions/`](../supabase/functions/)). The Squad secret key is no longer needed in the browser to take payments.

1. **Checkout:** the app calls `squad-checkout` (`initiate`). It starts a Squad checkout for the order's `total_amount` **as stored in the database**, never an amount from the browser.
2. **Return from Squad:** the confirmation page calls `squad-checkout` (`verify`). The function asks Squad for the transaction's real status and amount.
3. **Webhook:** Squad also calls `squad-webhook`, which checks Squad's signature (`x-squad-encrypted-body`, HMAC-SHA512 of the body) and does the same verification. This covers customers who close the tab before returning.
4. Both paths call `confirm_order_payment`, which:
   - marks the order `paid` only if the amount matches the order total exactly;
   - does nothing if the order is already paid, so the return page and the webhook can both run;
   - if the customer **cancelled before the payment landed**, refunds it straight to their wallet.

## Refunds

When a paid order is cancelled by the customer or rejected by the vendor, `refund_order` runs in the same step:
- the full `total_amount` is added to the customer's wallet (`customer_wallet.available_balance`);
- a `refund` row is written to `customer_transactions`;
- the payment hold is marked `refunded` and the order's `payment_status` becomes `refunded`;
- the customer gets a notification and an email.

Refunds used to be done by the vendor's browser; those access rules have been removed.

## Wallets

Wallet balances are only changed by the database; users can read their wallet but not write it (migration [`20260930100000_wallets_server_side.sql`](../supabase/migrations/20260930100000_wallets_server_side.sql)).

- **Wallets are created automatically** when an account is created, and a new virtual account is linked to its wallet automatically.
- **Credits:** order settlement on delivery (vendor, rider) and refunds (customer).
- **Withdrawals:**
  1. `request_payout(amount, bank account)` checks the balance and the bank account, deducts the amount, and creates a `pending` payout request, with a 1.5% fee taken from the amount sent.
  2. The `squad-payout` Edge Function sends the Squad transfer and marks it `processing`.
  3. If Squad rejects the transfer, or a later status check says it failed, the request becomes `failed` and the amount goes back to the wallet, once, with a notification. A successful transfer becomes `completed`.
- Users can view their payout requests but can't create or change them directly.

## When vendors and riders are paid

Nothing is credited until the order is `delivered`. On delivery the existing settlement (`process_order_settlement`) releases the payment hold: the vendor gets the items total minus the 10% commission, and the rider gets 85% of the delivery fee. See [PRICING_MODEL_IMPLEMENTATION_PLAN.md](PRICING_MODEL_IMPLEMENTATION_PLAN.md#how-the-money-is-split).

What each person sees on an order:

| | Sees | Doesn't see |
|---|---|---|
| **Customer** | Items, Service Charge, delivery fee, total | – |
| **Vendor** | Items with prices, items total, Cydex commission, amount credited (or to be credited) | The Service Charge, the delivery fee or the customer's total |
| **Rider** | Items and quantities (to check before leaving the vendor), delivery fee, Cydex commission, amount credited (or to be credited) | Item prices or the order total |

## Notifications

Created by the database (`notify_order_events` trigger, `welcome_new_user` trigger, `refund_order`) in the `notifications` table, and shown on each role's **Notifications** page with a live unread badge (capped at "9+"): in the sidebar, the mobile menu, and as a bell in the mobile top bar. New notifications also pop up as a toast while the app is open. **Mark all as read** clears the badge.

| Event | Customer | Vendor | Rider |
|---|---|---|---|
| Account created | Welcome + **email** | Welcome + **email** | Welcome + **email** |
| Payment confirmed | Payment confirmed + **email** | New order | |
| `accepted` | Order accepted | | |
| `ready_for_pickup` | Order ready | | Order nearby (online riders within 5 km of the store) |
| `rider_assigned` | Rider assigned | | |
| `picking_up` | Rider heading to vendor | | |
| `out_for_delivery` | Order on its way | Order picked up | |
| `delivered` | Order delivered | Delivered, with the amount credited | Delivery complete, with the amount credited |
| `cancelled` | Order cancelled | Order cancelled (only if it had been paid) | |
| `rejected` | Order rejected, with the vendor's reason | | |
| Refund | Refund issued + **email** | | |

"Welcome" is sent when the account is created, which is also the user's first login.

### Emails

Emails are queued in `email_outbox` by the database and sent by the `send-emails` Edge Function using [Resend](https://resend.com). Until that's set up (see below), emails stay queued and nothing is lost; notifications in the app work regardless.

## Setup still needed

Deploying the migrations and functions, setting the Squad secrets and webhook, and setting up emails are listed in [APP_TODO.md → General](APP_TODO.md#general).

## Known gaps

- **Riders could read item prices** by querying the database directly; the app just doesn't show them. Hiding them fully needs a separate view for riders.
- **One rider per order at a time**, and one active delivery per rider. There's no reassignment if a rider drops an order; an admin has to step in.
- **A locked code** (5 wrong tries) has no self-service reset yet.
