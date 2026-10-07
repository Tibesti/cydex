# Address Handling

How addresses are stored and used for customers, vendors and riders, as of September 2026.

**Summary:** every role saves addresses in one `addresses` table, picked with Google Maps (search + map pin, with coordinates). Customers can save several and deliver to their default. Vendors have one address, their store, which becomes the pickup location. Riders have one saved address, and also share their live location while using the app, which decides which orders they see. Orders and deliveries keep a copy of each address plus a link to the saved address it came from.

## At a glance

| Role | How many | Set from | Used for |
|---|---|---|---|
| Customer | Any number, exactly one default | Login popup, **Deliver to** bar, Profile → Saved addresses, checkout | Delivery (drop-off) |
| Vendor | One (label `Store`) | Login popup, Settings → Account → Store address | Pickup |
| Rider | One saved address (label `Home`), **plus** a live location in `rider_profiles.current_location` | Address: Profile → Personal. Live location: shared automatically while using the app (required) | Live location decides which orders they see (5 km) |

## The `addresses` table

Migrations: [`20260925000000_customer_addresses.sql`](../supabase/migrations/20260925000000_customer_addresses.sql) created it as `customer_addresses`, and [`20260925120000_shared_addresses.sql`](../supabase/migrations/20260925120000_shared_addresses.sql) renamed it and opened it to all roles.

- **Columns:**
  - `profile_id`, `label`
  - `place_name`, `formatted_address`, `street`, `city`, `state`, `country`, `place_id`
  - `latitude`, `longitude`
  - `directions` (notes for the rider), `is_default`
- **Rules enforced by the database:**
  - Each user has exactly one default. The first address saved becomes the default, setting a new default clears the old one, the default can't be switched off directly, and deleting it promotes the most recently added address.
  - **Vendors and riders can only have one address.** A second insert is rejected with "Vendors and riders can only have one address. Update the existing one instead."
  - Each user can only see and change their own addresses. Admins can read all of them.
- **Code:**
  - Data hook: [`useAddresses.ts`](../src/hooks/useAddresses.ts) (React Query), used by every role
  - Helpers: [`src/lib/address.ts`](../src/lib/address.ts)
  - Google settings: [`src/lib/googleMaps.ts`](../src/lib/googleMaps.ts)

`profiles.address` was dropped in the same migration. Nothing reads or writes it any more.

## The address picker (Google Maps)

[`src/components/address/AddressPickerDialog.tsx`](../src/components/address/AddressPickerDialog.tsx) is used by every role.

- **Search:** Google suggestions, limited to Nigeria and biased towards the area the map is showing (Places API (New)).
- **Map pin:** the pin stays in the centre, and the user drags the map under it. The address under the pin is looked up automatically (Geocoding API).
- **Use my location:** centres the map on the browser's GPS position.
- **Label:** customers choose Home, Hostel, Office or a custom name. Vendors and riders get a fixed label, `Store` or `Home`, and don't see the label or default choices.
- **Directions for the rider** (optional).
- The map opens on the University of Ibadan until something is picked.
- It needs `VITE_GOOGLE_MAPS_API_KEY` with **Places API (New)**, **Maps JavaScript API** and **Geocoding API** enabled. Without the key, the picker shows a message instead of the search.

## Customers

- **Login popup:** shown if they have no saved address. It becomes their default. "Not now" hides it until their next session. Component: [`AddressOnboarding.tsx`](../src/components/address/AddressOnboarding.tsx), shown by [`DashboardLayout.tsx`](../src/components/layout/DashboardLayout.tsx).
- **Deliver to bar:** at the top of every customer page ([`DeliveryAddressBar.tsx`](../src/components/customer/address/DeliveryAddressBar.tsx)). It shows the default address, and the menu switches the default, adds an address, or opens Manage addresses (`/customer/profile?tab=addresses`).
- **Profile → Saved addresses tab:** list, add, edit, remove, and **Set as default** ([`SavedAddresses.tsx`](../src/components/customer/address/SavedAddresses.tsx)). The Account tab has no address field.
- **Checkout:** a **Deliver to** step with the default preselected ([`ConfirmDeliveryAddressDialog.tsx`](../src/components/customer/address/ConfirmDeliveryAddressDialog.tsx)). Picking another saved address applies to that order only and doesn't change the default.
- **Vendor list and pricing:** customers only see vendors within 5 km of their default address, and the delivery fee is ₦600 + ₦200 per km from the vendor's store to the chosen address. See [PRICING_MODEL_IMPLEMENTATION_PLAN.md](PRICING_MODEL_IMPLEMENTATION_PLAN.md).

## Vendors

- **Login popup:** "Where is your store?", shown if they have no store address yet. "Not now" hides it until their next session.
- **Settings → Account → Store address** ([`src/pages/vendor/Settings.tsx`](../src/pages/vendor/Settings.tsx)): shows the store address with a **Set address / Change** button that opens the picker ([`SingleAddressField.tsx`](../src/components/address/SingleAddressField.tsx)). It saves on its own; there's no need to press the profile's Save button.
- **Used as the pickup location** for every delivery; see below.

## Riders

Riders have two separate things: a **saved address** and a **live location**.

### Saved address
- **Profile → Personal → Address** ([`PersonalInfoForm.tsx`](../src/components/rider/profile/tabs/forms/PersonalInfoForm.tsx)): the same one-address field as vendors ([`SingleAddressField.tsx`](../src/components/address/SingleAddressField.tsx)), saved with the label `Home`. There's no login popup for it.
- The profile header shows it ([`ProfileDetails.tsx`](../src/components/rider/profile/components/ProfileDetails.tsx)).
- Not used for deliveries.

### Live location
Shared automatically while the rider uses the app. It decides which orders they see: only those within **5 km**. See [PRICING_MODEL_IMPLEMENTATION_PLAN.md → Rider radius](PRICING_MODEL_IMPLEMENTATION_PLAN.md#1-rider-radius-5-km).

- **Tracking:** [`src/lib/riderLocation.ts`](../src/lib/riderLocation.ts) uses the browser's `watchPosition` and is shared by every rider screen through [`useRiderLocation`](../src/hooks/useRiderLocation.ts). It keeps running as the rider moves between pages.
- **Saved to `rider_profiles.current_location`** as `{ latitude, longitude, accuracy, heading, speed, timestamp, label, updated_at }`:
  - at most every 30 seconds
  - or sooner if the rider moved more than 50 m, but not more often than every 5 seconds
- **Location required:** [`RiderLocationGate.tsx`](../src/components/rider/location/RiderLocationGate.tsx) covers every rider page until location is allowed, including the brief check when the app first loads. It can't be dismissed. It explains how to unblock location if it was previously denied, and has a Log out button so nobody gets stuck.
- **Nav bar:** [`RiderLocationBar.tsx`](../src/components/rider/location/RiderLocationBar.tsx) shows "Live · Near …", or "Location is off" with a Turn on button. The "Near …" name comes from the Geocoding API, looked up at most once a minute and only after the rider moves about 200 m.
- **Profile:** Profile → Personal → Current location shows the same live status, below the saved address.
- **Order lists:** available orders show the real distance to pickup and sort nearest-first.
- **Limits of a web app:**
  - Location is only shared while the app is open and in the foreground. It pauses in the background or with the screen off.
  - It needs HTTPS or `localhost`. Opening the dev server by a network IP, such as `http://192.168.x.x:8080` on a phone, won't get location.
  - Always-on background tracking would need a native app.
- **Who can see it:** only the rider and admins; `rider_profiles` access rules are unchanged. Customers and vendors can't see it yet.

## Orders and deliveries

Each order and delivery stores a **copy** of the address (JSON) **and** a **link** to the saved address:

| Column | Holds | Filled by |
|---|---|---|
| `orders.delivery_address` + `orders.delivery_address_id` | Customer's chosen address | The database function `place_order`, called at checkout ([`NewOrder.tsx`](../src/pages/customer/NewOrder.tsx)) |
| `deliveries.delivery_location` + `deliveries.delivery_address_id` | Copied from the order | DB trigger `create_delivery_for_order` when the vendor accepts |
| `deliveries.pickup_location` + `deliveries.pickup_address_id` | Vendor's store address | Same trigger |

- **Why keep a copy as well as the link:** the copy is what the order was actually delivered to. Editing a saved address later doesn't move a past or in-progress delivery. If a saved address is deleted, the link is cleared (`ON DELETE SET NULL`) but the copy stays.
- **Vendor with no store address:** the pickup falls back to the old placeholder, `{ "address": "Vendor Location", "vendor_id": ... }`, and `pickup_address_id` stays empty.
- **Copy format:** the same for pickup and drop-off. It's built in the database by the SQL function `address_snapshot()`, for both `place_order` and the delivery trigger:
  ```json
  { "address_id": "...", "label": "Store",
    "address": "<formatted address>", "formatted_address": "...",
    "street": "<place name or street>", "city": "Ibadan", "state": "Oyo", "country": "Nigeria",
    "additional_info": "<directions>", "latitude": 7.44, "longitude": 3.89, "place_id": "..." }
  ```
  The order's drop-off copy also has the customer's `phone`, and the pickup copy has `vendor_id`. `address` is what the rider's Navigate button searches for.

```
addresses (customer default) ──checkout──► orders.delivery_address (+ delivery_address_id)
                                                  │
                                                  │ vendor accepts → trigger create_delivery_for_order
                                                  ▼
                              deliveries.delivery_location (+ delivery_address_id)
addresses (vendor store) ───────────────► deliveries.pickup_location (+ pickup_address_id)
```

## Known problems

1. **Riders still aren't shown the pickup address.** `deliveries.pickup_location` now holds the vendor's real store address, but the rider's Pickup Details card ([`src/pages/rider/OrderDetail.tsx`](../src/pages/rider/OrderDetail.tsx)) shows only the vendor's name, email and phone.
2. **Navigate only covers the drop-off, by text.** [`CurrentDeliveries.tsx`](../src/pages/rider/CurrentDeliveries.tsx) searches Google Maps for `delivery_location.address`. It could use `latitude`/`longitude`, which is more precise, and offer navigation to the pickup too. Orders placed before saved addresses don't have `address`.

## Suggested next steps

1. **Show the pickup address** on the rider's order screens, and add a Navigate button for it.
2. **Navigate by coordinates** when they're present, and fall back to the address text otherwise.
3. **Live order tracking for customers:** let the customer on an order read the assigned rider's `current_location` (a new access rule), and add `rider_profiles` to Realtime so the map updates live.
