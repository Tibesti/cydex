# Admin

What admins can see and do, and how it works underneath. Admins log in at `/admin/login` (or the normal login) and land on the Overview.

Most of this lives in migration [`20261008000000_admin_tools.sql`](../supabase/migrations/20261008000000_admin_tools.sql). Every admin function checks the caller is an admin (`require_admin()`), and every admin action is written to the activity log.

Before an action runs, the admin is asked **"Are you sure…?"**. Actions that affect someone else (cancelling, rejecting, suspending, hiding) also need a reason.

## Pages

| Page | What it's for |
|---|---|
| **Overview** | A To do list, money for a chosen period, a chart, live numbers and stuck orders. See below. |
| **Orders** | Every customer order and rider request. Search by order number, customer, vendor, rider or recipient, and filter by status and type. Open an order for its full details and the support actions. |
| **Money** | Five tabs: Earnings (the per-order breakdown), Withdrawals (approve or reject), Wallets, Held funds and Customer payments. |
| **Users** | Everyone, with their role, status and verification. Edit a name or phone, suspend or reinstate customers, and invite or remove admins. |
| **Verifications** | Review vendors and riders, and manage business categories. See [VERIFICATION.md](VERIFICATION.md). |
| **Reviews** | Vendor and rider reviews. Hide fake or abusive ones. |
| **Pricing** | Delivery fees, Service Charge and commissions, with the change history. |
| **Notifications** | The admin's own notifications (withdrawals to approve, verifications to review), with a bell on mobile. |
| **Emails** | Emails the app sends. Retry failed ones. |
| **Activity log** | Who did what, newest first. |
| **Content** | Announcements. |
| **Security** | Placeholder with sample data, kept for planning. Not connected yet. |

Lists show 10 rows per page, here and across the app (`PAGE_SIZE` in [`src/lib/pagination.ts`](../src/lib/pagination.ts)).

## Overview

- **To do:** shows lines like "You have 3 verifications to review" or "You have 2 withdrawal requests waiting for approval", plus stuck orders, orders waiting for a rider and failed emails. Each line links to the right page.
- **Period filter:** All time, This month, Last month, Last 3 months, Last 6 months or Custom dates. It drives the money figures and the chart.
- **Total transactions:** everything paid through Cydex in the period (customer orders and vendors' rider requests), including payments refunded later. The refunded amount is shown underneath.
- **Total revenue (Cydex):** Cydex's cut of orders **delivered** in the period, split by where it came from:
  - **From customers:** the Service Charge.
  - **From vendors:** the commission on items, plus the commission on rider requests.
  - **From riders:** the part of the delivery fee riders don't get (15% today).
  - **From withdrawal fees:** the 1.5% fee on withdrawals that were actually paid out (failed or rejected ones are refunded in full). It covers Squad's per-transfer charge (₦8–₦40), so the real profit is a little lower. Riders and vendors see the fee and what they'll receive before they confirm a withdrawal.
- **Chart:** transactions and revenue, or paid-order counts. It shows one bar per day for periods up to about 3 months, and one per month beyond that.
- **Right now** (not tied to the period): orders today, active deliveries, orders waiting for a rider, riders online, verifications to review, withdrawals to approve, money held for active orders and failed emails.
- **Orders needing attention:** paid orders stuck longer than usual (`admin_orders_needing_attention()`):

  | Status | Flagged after |
  |---|---|
  | Paid, vendor hasn't accepted | 15 min |
  | Accepted, not marked ready | 45 min |
  | Ready, no rider | 20 min |
  | Rider assigned, hasn't set off | 30 min |
  | Rider heading to vendor, not collected | 45 min |
  | Out for delivery | 60 min |
  | Any open order with a locked handover code | right away |

## Money

### Earnings: the breakdown table

One row per delivered order (`admin_earnings()`, built on the `order_money_split` view), with the period's totals at the top and bottom, and a CSV download.

| Column | Customer order | Rider request |
|---|---|---|
| Paid | Items + delivery fee + Service Charge, paid by the customer | Delivery fee + commission, paid by the vendor |
| Vendor got | Items − vendor commission | – |
| Rider got | Rider share of the delivery fee | Same |
| Cydex from customer | Service Charge | – |
| Cydex from vendor | Vendor commission | Rider-request commission |
| Cydex from rider | Delivery fee − rider's share | Same |
| Cydex total | The three above | The three above |

Paid always equals Vendor got + Rider got + Cydex total. Refunded orders aren't listed, because nothing was kept.

### Withdrawals need an admin

1. A vendor, rider or customer asks to withdraw. `request_payout` takes the money out of their wallet and records a **pending** request. They're told it's waiting for approval, and all admins get a notification.
2. An admin opens **Money → Withdrawals**:
   - **Approve:** `squad-payout` (`action: 'approve'`) sends the Squad transfer. Two admins can't send the same one twice. If Squad rejects the transfer, the money goes back to the wallet.
   - **Reject** (with a reason): `admin_reject_payout`. The request becomes `cancelled`, the money goes back, and they're told why.
   - **Check status:** asks Squad about a transfer that's still processing. You rarely need it, because of the automatic check below.
3. **Finishing is automatic.** If Squad confirms the transfer straight away, it's marked **Paid** on approval. Otherwise a scheduled job (`payout-status-sweep`, every 10 minutes) checks every withdrawal still "sent" with Squad. Each one becomes **Paid**, or **Failed** with the money returned, and the rider or vendor is notified. Only paid withdrawals count towards withdrawal-fee revenue.

### Pricing

Each save adds a new `pricing_config` row (`admin_update_pricing`), with who changed it and an optional note. New orders use the newest row; orders already placed keep the prices they were charged. The page shows a worked example with the new prices.

| Setting | Allowed |
|---|---|
| Minimum delivery fare, price per km | ₦0 – ₦100,000 |
| Service Charge, vendor commission, rider-request commission | 0 – 50% |
| Rider share of the delivery fee | 50 – 100% |

## Order details

`admin_order_detail()` returns everything on one page:

- **People:** customer (or, for rider requests, the recipient's name and phone), vendor and rider, each with a tap-to-call phone number.
- **Route:** pickup and drop-off addresses, directions, distance, and the note or package details.
- **Items** (customer orders only).
- **Money:** what was paid and how, then the split (expected while held, final once delivered).
- **Wallet movements** for this order.
- **Timeline:** every step with its time, including who cancelled it and why.
- **Handover codes:** status only (used, wrong tries, locked). Admins never see the digits.
- **Ratings** for this order, and every **admin action** taken on it.

Actions:

- **Cancel & refund** (any open order, with a reason). `admin_cancel_order` cancels the order and its delivery, and refunds through `refund_order`: to the customer's wallet, or to the vendor's for a rider request. The customer, vendor and rider are told "Cancelled by Cydex" with the reason.
- **Relieve or reassign the rider:** see [ORDER_FLOW.md → Admin tools](ORDER_FLOW.md#admin-tools).
- **Unlock a code** after 5 wrong tries (`admin_unlock_handover_code`).

## Users

- **Suspend a customer** (with a reason): `admin_set_customer_suspended`. They see an **Account suspended** screen with the reason, get a notification and an email, and the database refuses new orders from them. **Reinstate** lifts it.
- **Vendors and riders** are suspended through Verifications, so their store or deliveries stop too.
- **Edit name and phone** for anyone.
- **Invite an admin:** enter their name and email (one that doesn't already have a Cydex account).
  - The `admin-team` Edge Function sends Supabase's invite email and makes the new account an admin.
  - The link opens **/auth/set-password**, where they choose a password and land in the admin dashboard. After that they log in normally.
  - Sign-up itself can never create an admin.
- **Resend an invite** (it replaces the old link), **cancel an invite**, or **remove admin access**. A removed admin keeps their login as a regular customer. You can't remove yourself or the last admin.

## Reviews

**Hide** a review with a reason (`admin_set_review_hidden`):

- It stays in the database.
- Only its author and admins can see it.
- It no longer counts in the vendor's or rider's average.

**Show** reverses this.

## Emails

The **Emails** page lists `email_outbox`, failed emails first. **Retry** (`admin_retry_email`) puts a failed email back in the queue; `send-emails` sends it within a minute.

## Activity log

Every admin action is written to `audit_logs` with the admin, what they did, the target and the reason or values. This covers verification decisions, cancellations, relieving and reassigning riders, unlocking codes, approving and rejecting withdrawals, pricing changes, suspensions, hiding reviews, email retries and admin invites.

## Deploying

```
npx -y supabase@2.118.0 db push --linked
npx -y supabase@2.118.0 functions deploy squad-payout admin-team send-push
```

In Supabase → Authentication → URL Configuration, add `https://<domain>/auth/set-password` to the redirect URLs. Invites and password resets both land there.
