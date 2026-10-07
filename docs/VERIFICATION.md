# Vendor and Rider Verification

How vendors and riders get onto Cydex: onboarding, the verification statuses, what each status allows, and how admins review. As of October 2026.

Database: migration [`20261007000000_verification.sql`](../supabase/migrations/20261007000000_verification.sql), table `verifications`.

## Onboarding

Every vendor and rider, new or existing, goes through onboarding before using the dashboard. Logging in sends them to `/vendor/onboarding` or `/rider/onboarding` until they've submitted it.

| Vendors provide | Riders provide |
|---|---|
| **Store name** (what customers see; saved as their profile name) | **Phone number** |
| **Phone number** | **Home address** (pin-drop) |
| **Store logo and banner** (also editable in Settings → Account) | **Vehicle:** on foot, bicycle, electric bike, motorcycle or car. **Model, year and colour** for motor vehicles; **registration** if it has one |
| **Business category** (from the admin's list; currently Restaurant) | **Government ID:** National ID, passport, voter's card or driver's licence, plus a photo or scan |
| **Registered business?** If yes, a **business licence** upload | |

Documents go to the private `verification-docs` storage bucket. Only the user and admins can open them. Uploads are limited to PDF, PNG, JPG or WebP files of up to 5 MB.

## Statuses

| Status | Vendor | Rider |
|---|---|---|
| *(not onboarded)* | Sent to onboarding | Sent to onboarding |
| `pending` | **Uploaded a licence:** sees the "Awaiting verification" screen and is told to watch their email. A vendor who was already trading as unverified keeps trading while their licence is reviewed. | Always pending after submitting. Sees "Awaiting verification". |
| `unverified` | **No licence:** full dashboard access straight away. Listed to customers **without** the verified badge. Can apply later from Settings → **Get verified**. | – |
| `verified` | Full access, with the **verified badge** on their cards and store page. | Full access. Can see and accept orders. |
| `rejected` | Sees the reason and **Edit and resubmit**, which returns them to `pending`. | Same. |
| `suspended` | Sees the reason; no access until reinstated. | Same; also set offline. |

**What the database enforces**, not just the screens:
- Only vendors who are `verified` or `unverified` (or pending while already trading) are listed to customers, can receive orders, can accept orders, or can request riders.
- Only `verified` riders see available orders, get "order nearby" alerts, or can accept deliveries.

Customers see **Verified** or **Unverified** on every vendor card and store page, and can filter the vendor list with **Verified only**.

## Admin review

Admin sidebar → **Verifications**:
- **Requests:** filter by status (pending first) and by vendors or riders. Open a request to see everything submitted, the address, and the licence or ID document.
- **Actions:**
  - **Verify:** from pending, unverified or rejected.
  - **Reject:** from pending, with a **required reason**. A vendor who was trading as unverified goes back to unverified, not blocked.
  - **Suspend:** any time, with a **required reason**.
  - **Reinstate:** a suspended account returns to its status before the suspension.
- Each decision notifies the user in the app and queues an email (approved, rejected with the reason, suspended with the reason). Admins get a notification for every new request.
- **Business categories** tab: add categories, or switch one off for new sign-ups.

The older flags `profiles.verified` and `rider_profiles.is_verified` / `verification_status` are kept in sync automatically.
