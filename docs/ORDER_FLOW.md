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
