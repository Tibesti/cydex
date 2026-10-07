# Notification Settings and Push

How users choose between email and push, and how push notifications are delivered. As of October 2026. For what triggers each notification, see [ORDER_FLOW.md → Notifications](ORDER_FLOW.md#notifications).

Database: migration [`20261007100000_notification_settings_and_push.sql`](../supabase/migrations/20261007100000_notification_settings_and_push.sql).

## Settings

Every user has two switches. Customers find them in Profile → Preferences, vendors in Settings → Preferences, and riders in Profile → Personal.

| Setting | Default | Effect |
|---|---|---|
| **Email notifications** | On, for every new account | Off: nothing is queued in `email_outbox` for them (welcome, payment, refund, verification emails) |
| **Push notifications on this device** | Off | On: notifications also arrive as browser/phone notifications, even with Cydex closed |

- **In-app notifications are always on.**
- **Notifications page:** the page for each role shows **Allow push notifications** until push is on for that device.
- **Vendors:** see a reminder banner on every dashboard page until push is on: "Turn on push notifications so you don't miss customer orders". It's a reminder, never a block.

## Where push works

- **Android, Windows, Mac and Linux:** Chrome, Edge, Firefox, and Safari on Mac.
- **iPhone and iPad:** only once Cydex is **added to the Home Screen** and opened from there. The app explains this instead of offering a switch that can't work.
- **Blocked notifications:** if someone denied the browser's prompt, the app tells them to allow notifications in their browser settings.

## How it works

1. **Turning push on:** the browser asks permission. The app then registers `public/sw.js`, the service worker, and saves the device's subscription with `register_push_subscription`. The subscription is stored in `push_subscriptions`, one row per browser or device.
2. **Sending:** every new row in `notifications` calls the `send-push` Edge Function through `pg_net`, for users with push on.
3. **Delivery:** `send-push` reads the notification itself and sends it once (`notifications.push_sent_at`) to that user's devices. It removes subscriptions that browsers report as expired.
4. **Tapping it:** opens the matching order page, or the Notifications page.

A push that can't be sent never blocks the notification itself.

## Setup (once per Supabase project)

- **VAPID keys:** the standard Web Push signing keys, generated with `npx web-push generate-vapid-keys`.
  - The public key goes in `VITE_VAPID_PUBLIC_KEY`.
  - Both keys go in the function secrets:
    ```
    npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@your-domain
    ```
  - Never put the private key in a `VITE_` variable.
- **Deploy:** `npx supabase functions deploy send-push`
- **Functions URL:** `app_config.functions_url` must point at the project's functions, `https://<project-ref>.supabase.co/functions/v1`. It's set for the current project; change it on a new one.
