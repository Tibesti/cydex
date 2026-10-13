# Cydex Test Scenarios

Test scenarios for the product team, covering every role in the app: customers, vendors, riders and admins. As of October 2026.

Each scenario has an ID, the steps to follow and what should happen. If what happens is different, that's a bug: note the scenario ID, the account you used, the time, and a screenshot, and send it to the development team.

For how each feature is meant to work, see [ORDER_FLOW.md](ORDER_FLOW.md), [ADMIN.md](ADMIN.md), [VERIFICATION.md](VERIFICATION.md) and [NOTIFICATIONS.md](NOTIFICATIONS.md).

## Contents

1. [Before you start](#1-before-you-start)
2. [The people (personas)](#2-the-people-personas)
3. [Signing up and getting verified](#3-signing-up-and-getting-verified)
4. [Customer: browsing and the cart](#4-customer-browsing-and-the-cart)
5. [Customer: checkout](#5-customer-checkout)
6. [An order from start to finish](#6-an-order-from-start-to-finish)
7. [Cancelling and refunds](#7-cancelling-and-refunds)
8. [Cydex Express](#8-cydex-express)
9. [Vendor: store, products and hours](#9-vendor-store-products-and-hours)
10. [Vendor: Request Rider](#10-vendor-request-rider)
11. [Rider: going online and taking deliveries](#11-rider-going-online-and-taking-deliveries)
12. [Distance for each delivery mode](#12-distance-for-each-delivery-mode)
13. [Promotions and coupons](#13-promotions-and-coupons)
14. [Wallets and withdrawals](#14-wallets-and-withdrawals)
15. [Broadcasts](#15-broadcasts)
16. [Admin](#16-admin)
17. [Notifications, emails and the installed app](#17-notifications-emails-and-the-installed-app)
18. [Things that should be refused](#18-things-that-should-be-refused)

---

## 1. Before you start

**Accounts.** Create one account for each persona below, each with its own email address. Use real inboxes you can open, because several scenarios check emails.

**Devices.** Test on at least one Android phone, one iPhone and one computer. Riders must be tested on a phone with location turned on, because a rider is only online while the app can see where they are.

**Where everyone needs to be.** Deliveries only work over short distances. Put the vendor's store, the customer's delivery address and the rider within about 2 km of each other, unless a scenario says otherwise.

**Payments.** Ask the development team which payment mode the test site is in. In test mode, use Squad's test cards. In live mode, real money moves, so use small amounts.

**Emails.** Emails are only delivered once the email service is connected ([DEPLOYMENT_CHECKLIST.md → Emails](DEPLOYMENT_CHECKLIST.md#4-emails-brevo)). Until then they wait in **Admin → Emails**, where you can still check that each one was created.

**Starting settings.** Before testing, an admin should check:

| Where | Setting | Starting value |
|---|---|---|
| Admin → Pricing | Delivery charge | ₦500 |
| Admin → Pricing | Service Charge | 15% |
| Admin → Pricing | Vendor commission / rider share | 10% / 85% |
| Admin → Riders & vehicles | Price per km, each vehicle type | ₦200 |
| Admin → Riders & vehicles | Longest trip, each vehicle type | 5 km |
| Admin → Riders & vehicles | Idle riders | 30 minutes |
| Admin → Promotions | Running promotions | None, unless a scenario creates one |

**Checking the sums.** With the starting values:

- **Delivery fee** = distance × ₦200 + ₦500. A 2 km trip costs ₦900.
- **Service Charge** = 15% of the items. ₦2,000 of items adds ₦300.
- **Customer pays** items + delivery fee + Service Charge. In this example ₦3,200.
- **Vendor gets** items minus 10%. Here ₦1,800.
- **Rider gets** 85% of the delivery fee. Here ₦765.

---

## 2. The people (personas)

| Persona | Role | Who they are | Used to test |
|---|---|---|---|
| **Amaka** | Customer | A student ordering lunch for the first time. No money in her wallet. | First order, card payment, tracking, rating |
| **Tunde** | Customer | Orders several times a week. Has money in his wallet from a refund. | Wallet-first payment, coupons, limits, reordering |
| **Ngozi** | Customer | Wants to send a parcel to her sister across campus. | Cydex Express |
| **Bisi** | No account | Ngozi's sister. Receives a delivery and has never used Cydex. | Delivery code by email |
| **Mama Put Kitchen** | Vendor (Restaurant) | A small food seller with no business licence. | Unverified vendor, products, opening hours, orders |
| **Campus Mart** | Vendor (Shop) | A registered shop that also takes orders on WhatsApp. | Verified vendor, Request Rider, batches, withdrawals |
| **Sola** | Rider (Bicycle) | Rides full time. | Most deliveries, batches, earnings |
| **Kemi** | Rider (Walking, shown to customers as "Cydex Dashers") | Delivers on foot between lectures. | Short trips, distance limits, preferred mode |
| **Emeka** | Rider (Petrol bike) | Has a registered motorcycle. | Vehicle documents, longer trips |
| **Ops admin** | Admin | Runs day-to-day operations. | Verifications, pricing, promotions, broadcasts, support |

---

## 3. Signing up and getting verified

| ID | Steps | What should happen |
|---|---|---|
| SU-01 | Sign up as **Amaka** (customer). | She lands on the customer home page. She gets a welcome notification and a welcome email. |
| SU-02 | As Amaka, try to see vendors before adding an address. | She's asked to add a delivery address first. After adding one on the map, vendors near it are listed. |
| SU-03 | Sign up as **Mama Put Kitchen** (vendor). Complete onboarding: store name, phone, logo and banner, category **Restaurant**, opening hours, preparation time, **not** a registered business. | She goes straight to the vendor dashboard. Customers see her store marked **Unverified**. No "we're reviewing" email is sent. |
| SU-04 | Sign up as **Campus Mart**. Choose category **Shop**, say it's a registered business and upload a licence. | The "Awaiting verification" screen shows. A "We're reviewing your details" email is sent. The admin gets a "verification to review" notification. |
| SU-05 | As the admin, open **Verifications**, open Campus Mart and **Verify**. | Campus Mart can use the dashboard. Customers see the **Verified** badge. A "You're verified" email is sent. |
| SU-06 | Sign up as **Kemi** (rider). Choose **Walking**. | No vehicle colour, photo or registration is asked for. Only phone, home address and ID. |
| SU-07 | Sign up as **Sola**. Choose **Bicycle**. | Colour and a photo of the bicycle are required. No registration number. |
| SU-08 | Sign up as **Emeka**. Choose **Petrol bike**. | Colour, photo, registration number and a registration document are all required. He can't submit without them. |
| SU-09 | As the admin, **Reject** Emeka with a reason. | Emeka sees the reason and **Edit and resubmit**. He gets a "wasn't approved" email with the reason. |
| SU-10 | As Emeka, resubmit. As the admin, verify him. Then verify Sola and Kemi. | Each rider gets "You're verified" and can see Available Orders. |
| SU-11 | As a verified rider, change the vehicle details in **Profile**. | A warning says access stops until the account is approved again. After saving, the rider is back to "Awaiting verification". |
| SU-12 | As the admin, **Suspend** a rider with a reason, then reinstate them. | Suspended: the rider sees the reason, has no access and is set offline. They get an email each time. |

---

## 4. Customer: browsing and the cart

| ID | Steps | What should happen |
|---|---|---|
| BR-01 | As Amaka, open the home page. | Three sections: Vendors nearby, Popular vendors, Other vendors. Each card shows Verified or Unverified, the rating, distance, **Open** or **Closed**, today's hours and "Ready in about … min". |
| BR-02 | Open Mama Put Kitchen. | The store page shows the banner, logo, Open/Closed, today's hours, an estimated delivery time and an **Opening hours** link that shows the whole week. |
| BR-03 | Add two products to the cart. | A large **Go to cart (₦…)** button appears at the bottom of the screen with the items total and the number of items. The cart does **not** open by itself. |
| BR-04 | With items in the cart, go to the home page and tap **See all vendors**. | The vendor list shows. The cart stays closed. The **Go to cart** button is at the bottom. |
| BR-05 | On a phone, tap the cart icon in the top bar on the home page, then tap **See all vendors**. | The cart does not pop open on the vendor list. |
| BR-06 | Tap **Go to cart**. | The cart opens with the items, delivery fee, Service Charge and total for the default address. |
| BR-07 | With Mama Put's items in the cart, add a product from Campus Mart. | A dialog asks: **Keep current cart** or **Start new cart**. |
| BR-08 | As the vendor, set today as closed in **Settings → Hours**. As Amaka, open the store. | The card and store page show **Closed**. A red notice says she can look around but can only order during opening hours. **Proceed to Checkout** is disabled. |
| BR-09 | As the vendor, set hours that end after midnight (for example 6:00 pm to 2:00 am). Check at 1:00 am. | The store shows as **Open**. |
| BR-10 | Add a product that tracks stock, with more than is in stock. | The quantity stops at the stock number, with a message saying so. Out-of-stock products are greyed out and can't be added. |

---

## 5. Customer: checkout

Start each scenario with items from one open vendor in the cart, and at least one rider online nearby.

| ID | Steps | What should happen |
|---|---|---|
| CO-01 | As Amaka, tap **Proceed to Checkout**. | The **Deliver to** dialog opens with her default address selected, a **Preferred delivery mode** list, an estimated delivery time, a coupon field and the price. |
| CO-02 | Look at the delivery mode list with only Sola (bicycle) online. | **Bicycle** is selected. **Cydex Dashers** and the others say "no rider free right now" and can't be picked. |
| CO-03 | Bring Kemi (walking) online too. Reopen checkout and choose **Cydex Dashers**. | It can now be picked. The delivery fee and estimated time update for that mode. |
| CO-04 | Check the delivery fee against the distance shown. | Distance × the mode's price per km + ₦500. |
| CO-05 | Check the estimated delivery time. | A range such as "20–35 min", in steps of 5 minutes. The note says how long the vendor takes to prepare. |
| CO-06 | Choose a different saved address in the dialog. | The price and time update. The default address in the profile doesn't change. |
| CO-07 | Take every rider offline. Reopen checkout. | A red message: "Our service is currently unavailable because all our riders are busy at the moment. Please check again later." The button to continue is disabled. |
| CO-08 | As Amaka (empty wallet), continue to pay. | The button reads **Continue to pay ₦…**. The payment window opens for the full total. After paying, the order shows as paid. |
| CO-09 | As Tunde, with ₦1,000 in his wallet and a total above that. | The price box shows "From your wallet ₦1,000" and what's left to pay by card. The payment window asks only for the rest. |
| CO-10 | As Tunde, with more in his wallet than the total. | The button reads **Pay ₦… from wallet**. There's no card step. He lands on the order page, already paid. |
| CO-11 | As Tunde (wallet covers part), close the payment window without paying. Open the order. | A yellow box shows **Pay ₦…** to finish. If he doesn't, after 30 minutes the wallet part is back in his wallet and the order is cancelled. |
| CO-12 | Pay by card, then close the browser tab before it returns to Cydex. | The order still becomes paid within a minute or so. |

---

## 6. An order from start to finish

One order, followed through every role. Use Amaka, Mama Put Kitchen and Sola.

| ID | Who | Steps | What should happen |
|---|---|---|---|
| OR-01 | Amaka | Place and pay for an order. | Status **Pending**. She gets "Payment confirmed" as a notification and an email. |
| OR-02 | Mama Put | Open **Orders**. | The new order is there, with a "New order" notification and a chime. She sees items and her earnings, not the customer's delivery fee or Service Charge. |
| OR-03 | Mama Put | **Accept**. | Status **Accepted**. Amaka sees a 4-digit **delivery code** on her order page. |
| OR-04 | Mama Put | **Mark ready**. | Status **Ready for pickup**. Sola gets "Order nearby". |
| OR-05 | Sola | Open **Available Orders** and the order's details. | He sees the vendor's name, address and phone, the customer's address, the items without prices, and what he'll earn. |
| OR-06 | Sola | **Accept**. | Status **Rider assigned**. Amaka sees Sola's name, what he's doing and a **Call** button. Sola sees a 4-digit **pickup code**. |
| OR-07 | Sola | Tap **Head to vendor**. | Status **Rider heading to vendor**. Amaka is notified. |
| OR-08 | Mama Put | Tap **Hand to rider** and enter Sola's pickup code. | Status **Out for delivery**. Amaka is told to have her code ready. |
| OR-09 | Mama Put | Enter a wrong pickup code. | "Incorrect". Nothing changes. After 5 wrong tries the code is locked. |
| OR-10 | Sola | Near the customer, tap **I've arrived**. | Status **Rider is around**. Amaka gets a "Your rider is around" notification and push, with a longer chime. Her order page shows a banner telling her to meet the rider and give the code. |
| OR-11 | Sola | Tap **Complete delivery** and enter Amaka's delivery code. | Status **Delivered**. Sola's and Mama Put's wallets are credited. |
| OR-12 | Sola | Skip **I've arrived** on another order and go straight to **Complete delivery**. | It works. "I've arrived" is optional. |
| OR-13 | Amaka | Open the delivered order. | She can rate the rider and the vendor, once each. |
| OR-14 | Admin | Open **Money → Earnings**. | The order's row adds up: customer paid = vendor + rider + Cydex. |
| OR-15 | Amaka | Choose **Cydex Dashers** at checkout. After the vendor marks it ready, Kemi does nothing for 10 minutes. | For the first 10 minutes only Kemi sees it; Sola doesn't. After 10 minutes Sola is alerted and can accept it. Amaka is told it was offered to other delivery partners. The price doesn't change. |

---

## 7. Cancelling and refunds

| ID | Steps | What should happen |
|---|---|---|
| RF-01 | As Amaka, cancel a paid order before the vendor accepts. | The order is **Cancelled**. The full amount is in her wallet. She gets a refund notification and email. |
| RF-02 | Try to cancel after the vendor has accepted. | There's no cancel button. |
| RF-03 | As the vendor, reject a paid order with a reason. | The customer sees the reason and is refunded in full to the wallet. |
| RF-04 | As the vendor, try to reject after a rider has accepted. | It's refused. |
| RF-05 | As Tunde, pay partly from the wallet and partly by card, then cancel. | Both parts come back to the wallet. |
| RF-06 | As the admin, **Cancel & refund** an order from its order page, with a reason. | The customer, vendor and rider (if any) are told, with the reason. The customer is refunded. |
| RF-07 | Refund an order that used a product with tracked stock. | The stock goes back up. |

---

## 8. Cydex Express

Use Ngozi (sender), Bisi (recipient, no account) and a rider.

| ID | Steps | What should happen |
|---|---|---|
| EX-01 | As Ngozi, open **Cydex Express** in the side menu. | A page with four steps: pickup, drop-off and recipient, what's being sent, delivery and payment. |
| EX-02 | Choose the pickup from a saved address. Choose the drop-off on the map. | Once both are set, the distance, delivery modes, estimated time and price appear. |
| EX-03 | Check the price. | Delivery fee + a Service Charge of 15% of the delivery fee. A ₦900 fee totals ₦1,035. |
| EX-04 | Leave the recipient's email empty, or enter an invalid one. | The booking button stays disabled, with a note saying what's missing. |
| EX-05 | Fill everything in with Bisi's details and book. | A confirmation asks "Are you sure…?". After paying, the delivery shows in **Orders** as **Cydex Express**, with tracking. |
| EX-06 | Check Bisi's inbox. | An email with the 4-digit delivery code, who sent it, and an invitation to try Cydex with a link to usecydex.com. |
| EX-07 | As Ngozi, open the delivery. | She sees the same delivery code, with a note to share it with Bisi. |
| EX-08 | As the rider, accept it and tap **Head to pickup**. | The rider sees "Pick up from Ngozi (Cydex Express)" with her address and phone, and a pickup code. |
| EX-09 | As Ngozi, tap **Enter pickup code** and enter the rider's code. | Status **Out for delivery**. |
| EX-10 | As the rider, tap **I've arrived**, then complete the delivery with Bisi's code. | Ngozi is told the rider is at the drop-off. Then **Delivered**, and the rider is paid 85% of the delivery fee. |
| EX-11 | Book another one and cancel it before a rider accepts. | Cancelled and refunded in full. |
| EX-12 | Try to cancel after a rider accepts. | There's no cancel button. |
| EX-13 | Choose a drop-off further than any delivery mode goes. | A message says it's further than Cydex delivers. It can't be booked. |
| EX-14 | With no rider online near the pickup. | The "all our riders are busy" message. It can't be booked. |

---

## 9. Vendor: store, products and hours

| ID | Steps | What should happen |
|---|---|---|
| VS-01 | As Mama Put (Restaurant), add a product. | The category list shows restaurant categories: Main meals, Drinks, Sides & extras, Swallows, Proteins and so on. |
| VS-02 | As Campus Mart (Shop), add a product. | The category list shows shop categories: Groceries & staples, Snacks & biscuits, Electronics & accessories and so on. |
| VS-03 | In **Settings → Hours**, change the preparation time to 30 minutes. | Customers see "Ready in about 30 min", and the estimated delivery time at checkout gets longer. |
| VS-04 | Set every day as closed and save. | It's refused: at least one open day is needed. |
| VS-05 | Open **Orders → Rider requests** tab. | Past rider requests are listed, separate from customer orders. |
| VS-06 | Open a delivered order. | Items total, Cydex commission and the amount credited. No delivery fee or Service Charge. |
| VS-07 | Remove the phone number from the profile and try to accept an order. | Accept is disabled, with a notice linking to Settings. |

---

## 10. Vendor: Request Rider

Use Campus Mart, with money in the vendor wallet for some scenarios.

| ID | Steps | What should happen |
|---|---|---|
| RR-01 | Open **Request Rider**, choose **Single**. Enter a customer's name, phone, email and location. | The price shows: delivery fee + 10% Cydex commission. A ₦900 fee totals ₦990. |
| RR-02 | Leave the email empty. | The request can't be sent. |
| RR-03 | Tick "Save this customer" and send. On the next request, search for that customer. | Typing part of the name or phone finds them. Picking them fills in every field. |
| RR-04 | With enough in the wallet. | "Paid from your wallet. Nearby riders have been notified." No card step. |
| RR-05 | With too little in the wallet. | The wallet pays what it can and the card pays the rest. |
| RR-06 | Check the recipient's inbox. | An email with the delivery code. The vendor sees the code on the request page too. |
| RR-07 | Follow the request: rider accepts, vendor enters the pickup code, rider completes with the delivery code. | Delivered. The rider gets 85% of the delivery fee. Nothing is credited to the vendor. |
| RR-08 | Choose **Batch** and add three drop-offs. | Each drop-off is priced separately: the first from the store, each next one from the one before. The total is the sum. |
| RR-09 | Try to add more drop-offs than allowed (5). | The **Add** button stops at the limit. |
| RR-10 | Send the batch. As Sola, open Available Orders. | One card saying "3 drop-offs". Accepting it gives him all three. |
| RR-11 | As Sola, look at the three deliveries. | Labelled "Drop-off 1 of 3" and so on. One pickup code covers all three. Each drop-off has its own delivery code. |
| RR-12 | Check each recipient's inbox. | Each has their own code. |
| RR-13 | Cancel a request, and a batch, before a rider accepts. | Everything paid goes back to the vendor's wallet. |
| RR-14 | With no rider online near the store. | The "all our riders are busy" message, before payment. |

---

## 11. Rider: going online and taking deliveries

| ID | Steps | What should happen |
|---|---|---|
| RD-01 | As Sola, open the app with location allowed. | The bar at the top shows **Live** and where he is. He's online. |
| RD-02 | Turn location off for the app. | "Location is off". He's offline and sees no new orders. |
| RD-03 | Close the app for a few minutes. | He goes offline within about 2 minutes. |
| RD-04 | As the admin, set **Idle riders** to 2 minutes. As Sola, stay online without taking an order. | Within a few minutes the bar says he's offline because he hasn't taken an order in a while, with a **Go online** button. |
| RD-05 | Tap **Go online**. Separately: leave the app and come back. | Both bring him back online. |
| RD-06 | Set **Idle riders** back to 30. While on a delivery, wait past the idle time. | He stays online. A rider on a delivery isn't idle. |
| RD-07 | Try to accept a second order while on a delivery. | Refused: "Finish your current delivery before accepting another". |
| RD-08 | Two riders tap **Accept** on the same order at the same moment. | One gets it. The other is told it's no longer available. |
| RD-09 | Remove the phone number and try to accept. | Accept is disabled, with a notice linking to Profile. |
| RD-10 | Open **Earnings** after a delivery. | The delivery fee, Cydex's commission and the amount credited. Total trips has gone up by one. |

---

## 12. Distance for each delivery mode

The admin sets how far each vehicle type goes in **Admin → Riders & vehicles → Edit → Longest trip**.

For these scenarios, set: **Walking 1 km, Bicycle 3 km, Petrol bike 6 km**. Use a customer about 2 km from the vendor.

| ID | Steps | What should happen |
|---|---|---|
| DS-01 | As the admin, open Riders & vehicles after saving. | Each type shows "trips up to … km". |
| DS-02 | As Amaka (2 km away), open checkout with Kemi and Sola both online. | **Cydex Dashers** says "only goes up to 1 km" and can't be picked. **Bicycle** can. |
| DS-03 | With only Kemi (walking) online. | The "all our riders are busy" message. A walker doesn't count for a 2 km trip. |
| DS-04 | Place the order with Bicycle. Vendor marks it ready. | Sola is alerted and sees it. Kemi isn't alerted and doesn't see it. |
| DS-05 | Leave that order unaccepted for more than 10 minutes. | It's offered to other modes, but Kemi still doesn't see it. Emeka (6 km) does. |
| DS-06 | Add a delivery address about 5 km from the vendor. | The vendor is listed for that address, because the petrol bike goes that far. At checkout only **Petrol bike** can be picked. |
| DS-07 | Add a delivery address about 8 km away. | The vendor isn't listed for that address. |
| DS-08 | Switch **Petrol bike** off. Look again from the 5 km address. | The vendor is no longer listed, because the longest active mode is now 3 km. The wording says "Vendors within 3 km". |
| DS-09 | As Campus Mart, request a rider to a place 2 km away. | Only modes that reach it can be picked. |
| DS-10 | Start a batch where one leg is longer than every mode goes. | A message names the drop-off that's too far. |
| DS-11 | As Ngozi, try Cydex Express over 4 km with Petrol bike switched back on. | Only Petrol bike can be picked. |
| DS-12 | Set every type back to 5 km. | Everything behaves as before these scenarios. |

---

## 13. Promotions and coupons

Created in **Admin → Promotions → New promotion**. Switch each promotion off after its scenario, so they don't affect the next one.

### For customers

| ID | Steps | What should happen |
|---|---|---|
| PR-01 | Create: for **Customers**, **Delivery fee**, 100%, no code. | Customers see it under **Offers for you** on their home page, marked "Applied automatically". At checkout a green **Offer applied** box names the promotion and the saving, and the delivery fee is taken off on its own green line. The cart and the payment step show the discount too. |
| PR-02 | Create: for Customers, Service Charge, flat ₦200, code **WELCOME200**. | The price doesn't change until the code is entered. After typing it and tapping **Apply**: "WELCOME200 applied" and ₦200 off. The code works in any mix of capitals and with spaces. |
| PR-02a | Same coupon. As a customer, open the home page. | It's under **Offers for you** with the code shown and "Enter it at checkout". Tapping the code copies it. |
| PR-02b | Same coupon. Open checkout without typing anything. | Under "Codes you can use" the code is listed with what it gives. Tapping it applies it: the coupon box shows "WELCOME200 applied" and the price drops. |
| PR-03 | Type a code that doesn't exist. | "That coupon code isn't valid." The order can still be placed without it. |
| PR-04 | Create an items discount for Mama Put Kitchen, paid by **the business**. Order from her. | The customer pays less for the items. Mama Put sees "Your promotion discount" on the order, and her commission is worked out on what's left. |
| PR-05 | Same, paid by **Cydex**. | The customer pays less. Mama Put is paid as if there were no discount. |
| PR-06 | Create a promotion only for **Cydex Dashers** deliveries up to 1 km. | It only applies when that mode is chosen and the trip is that short. |
| PR-02c | Create a coupon **PARTNER** with **Show in "Offers for you"** switched off. | The admin list marks it **Not in offers**. Customers don't see it on their home page or among the codes at checkout. Typing PARTNER at checkout still applies it. |
| PR-02d | Create an automatic promotion with the switch off. | It isn't under Offers for you, but checkout still shows **Offer applied** and takes the discount off. |
| PR-07 | Have an automatic promotion and a coupon both available. Open checkout, then tap the coupon. | First the automatic one shows as **Offer applied**, with the coupon listed underneath as an alternative. After tapping the coupon, only the coupon's discount is given. Removing the coupon brings the automatic one back. |
| PR-08 | Set a promotion's dates in the future, then in the past. | **Scheduled**: not applied yet. **Ended**: no longer applied. |

### Limits

| ID | Steps | What should happen |
|---|---|---|
| PR-10 | Create: for Customers, Delivery fee, ₦200 off, **only the first 1 person**, **2 uses each**. As Tunde, open checkout. | ₦200 off. His home page offer says "2 uses left · 1 place left". |
| PR-11 | Tunde places and pays for the order. As Amaka, open checkout. | No discount for Amaka: the one place is taken. It isn't in her offers. |
| PR-12 | Tunde orders a second time. | ₦200 off again. |
| PR-13 | Tunde tries a third time. | Full price. The offer is gone from his home page. |
| PR-14 | Tunde cancels one of the two orders (before the vendor accepts). | He gets a use back: the offer returns with "1 use left". |
| PR-15 | Create a coupon **ONCE** with 1 use each. Tunde uses it and pays, then tries it again. | After the first use it's gone from his Offers for you and from the codes at checkout. Typing it by hand: "You've already used this coupon as many times as it allows." |
| PR-16 | Create a coupon for the first 1 person. Tunde uses it. Amaka tries it. | Amaka sees "This coupon has been fully claimed." |
| PR-17 | As the admin, look at the promotion in the list. | It shows how many times and by how many people it's been used, and **Fully claimed** when every place and use is gone. |

### For vendors and riders

| ID | Steps | What should happen |
|---|---|---|
| PR-20 | Create: for **Vendors**, **Request Rider: delivery fee**, 50%. As Campus Mart, start a single request. | Half the delivery fee is taken off. It shows under **Offers for you** on the vendor dashboard. Customer checkouts aren't affected. |
| PR-21 | Same promotion. Start a **Batch**. | No discount, with a note that promotions apply to single requests. |
| PR-22 | Create a coupon for Vendors. As Campus Mart, start a single request. | The code is listed on the vendor dashboard's Offers for you and on the request form, one tap to apply. Customers don't see it; if a customer types it, it says it isn't for this kind of order. |
| PR-23 | Create: for Vendors, **Commission on their sales**, 50%. A customer orders ₦2,000 of items. | Cydex's commission on the order is ₦100 instead of ₦200. The vendor is credited ₦1,900. The customer pays the same as usual. |
| PR-24 | Create: for **Riders**, **Commission on their deliveries**, 100%, first 1 rider, 1 use each. As Sola, open the dashboard. | It shows under **Offers for you**: "Applied when you accept a delivery". |
| PR-25 | Sola accepts a delivery with a ₦900 fee. | His earning for it shows ₦900 instead of ₦765. On delivery his wallet gets ₦900. |
| PR-26 | Sola's next delivery. Then Emeka's. | Both at the usual 85%: Sola has used his one use, and the one place is taken. |
| PR-27 | Before delivery, the admin relieves Sola from a discounted order. | The discount comes off the order. Whoever takes it next gets their own rate. |
| PR-28 | As the admin, open **Money → Earnings** for the orders in PR-23 and PR-25. | Each row still adds up. The discount shows in **Promo cost**. |
| PR-29 | Try to give a commission promotion a coupon code. | The coupon field isn't offered. |
| PR-30 | Create a promotion for **Everyone** on the delivery fee. | Customers get it on orders and Cydex Express. Vendors get it on single rider requests. |

---

## 14. Wallets and withdrawals

| ID | Steps | What should happen |
|---|---|---|
| WD-01 | As Sola, with more than ₦3,000 available, open **Withdraw** and type ₦2,000. | A message: "The smallest amount you can withdraw is ₦3,000." The request button is disabled. |
| WD-02 | Type ₦3,000. | The breakdown shows the 1.5% fee (₦45) and what he'll receive (₦2,955). He can send the request. |
| WD-03 | As Campus Mart, try to withdraw ₦2,999. | Refused in the same way. |
| WD-04 | With less than ₦3,000 available. | The message says how much is available and that he can withdraw once he reaches ₦3,000. |
| WD-05 | Type more than the available balance. | "That's more than your available balance." |
| WD-06 | Send a valid request. | The amount leaves the wallet. Status **Pending**. The admin is notified. |
| WD-07 | As the admin, **Approve** it in **Money → Withdrawals**. | The transfer is sent. It becomes **Paid** when the bank confirms, without the admin doing anything more. |
| WD-08 | As the admin, **Reject** a request with a reason. | The full amount goes back to the wallet. The person is told why. |
| WD-09 | Before any delivery is completed, check a vendor's and rider's wallet. | Nothing is credited until the order is **Delivered**. |

---

## 15. Broadcasts

Sent from **Admin → Broadcasts → New broadcast**. Have a customer near the test area and one far away (for example, with their only address in another city).

| ID | Steps | What should happen |
|---|---|---|
| BC-01 | Enter a title and message. Send as **Notification**, to **Customers**, **Everyone in those groups**, **Now**. | The form shows how many people it reaches. After confirming, every customer gets the notification in the app. Those with push on get it on their phone too. Vendors and riders don't. |
| BC-02 | Send as **Email** only, to **Vendors**. | Vendors get an email in the Cydex layout with the title, the message and an **Open Cydex** button. No notification in the app. |
| BC-03 | Send as both, to Customers, Vendors and Riders. | Everyone gets both. |
| BC-04 | Write a message with a blank line in the middle and send it as an email. | The email has two paragraphs. |
| BC-05 | Choose **Only people near a place**. Search for the test area, set the radius to 5 km. | The reach number drops. Only the nearby customer gets it; the far one doesn't. |
| BC-06 | Send near a place to **Riders** while a rider is online inside the circle but lives outside it. | The rider gets it, because their last known location is inside. |
| BC-07 | Choose **At a set time**, a few minutes ahead. | It's listed as **Scheduled** and nobody gets it yet. Within a minute of the time, it's sent and marked **Sent** with the number of people. |
| BC-08 | Schedule one and **Cancel** it before its time. | It's marked **Cancelled** and never sent. |
| BC-09 | As a customer, turn **Email notifications** off in Preferences. Send a broadcast as an email. | That customer gets no email. |
| BC-10 | Tick neither Notification nor Email. Untick every group. Choose "near a place" without picking a place. | In each case the form can't be sent, and says what's missing. |
| BC-11 | Suspend a customer (Users) and a rider (Verifications). Send a broadcast to both groups. | Neither suspended account gets it. |
| BC-12 | Open **Activity log**. | Each broadcast created or cancelled is logged with the admin's name. |

---

## 16. Admin

| ID | Steps | What should happen |
|---|---|---|
| AD-01 | Open the **Overview**. | A To do list (verifications to review, withdrawals to approve, stuck orders), money for the chosen period, a chart and live numbers. |
| AD-02 | Change the period (This month, Last month, custom dates). | Total transactions and revenue change to match. |
| AD-03 | Try any action that changes something (verify, suspend, approve, save a price). | A dialog asks "Are you sure…?" first. Actions that affect someone else also need a reason. |
| AD-04 | In **Pricing**, change the delivery charge to ₦600 and save. | New orders use ₦600. Orders already placed keep their price. The change shows in the history. |
| AD-05 | In **Riders & vehicles**, change the bicycle's price per km to ₦250. | New bicycle deliveries cost distance × ₦250 + the delivery charge. |
| AD-06 | Add a vehicle type (for example "Cargo tricycle"). | Riders can choose it at registration. Customers can pick it once a rider with it is online. |
| AD-07 | In **Verifications → Business categories**, add a category with no product categories. | Refused: at least one product category is needed. |
| AD-08 | Try to remove the last product category of a business category. | The remove button is disabled. |
| AD-09 | Open an order where a rider has gone quiet. **Relieve rider** with a reason. | The order goes back to Available Orders, shown first. The rider is told why. The old pickup code stops working. |
| AD-10 | **Reassign rider** on an order. | Riders are listed online first, then nearest. A rider already on a delivery can't be picked. The old rider, new rider and customer are notified. |
| AD-11 | Open an order's page as the admin. | Full details, but the handover code digits are never shown. |
| AD-12 | In **Users**, invite a second admin. | They get an email, set a password and can log in as an admin. |
| AD-13 | In **Reviews**, hide a review. | It no longer shows to customers or counts in the rating. |
| AD-14 | Open any list with more than 10 rows. | 10 rows per page, with Previous and Next. |

---

## 17. Notifications, emails and the installed app

| ID | Steps | What should happen |
|---|---|---|
| NT-01 | On an Android phone, open the site. | An **Install** banner at the bottom. Tapping it installs Cydex with its own icon. |
| NT-02 | On an iPhone in Safari. | The banner shows the steps: Share, then Add to Home Screen. |
| NT-03 | On the landing page (logged out), scroll to **Get the Cydex app**. | On a computer, the install steps show beside the text, with tabs for Android, iPhone and Computer. On a phone, a **Download the app** button opens them. |
| NT-04 | In the footer of any public page, tap **Download App** under Quick Links. | A window opens with the install steps, opening on the tab for the device being used. |
| NT-05 | On Android or a computer in Chrome, open the install steps. | An **Install Cydex** button installs it in one tap. |
| NT-06 | Open the installed app when logged out, and when logged in. | Logged out: the login page. Logged in: straight to that person's home page. |
| NT-07 | Turn on push notifications. Close the app. Have something happen (for example, the vendor accepts your order). | A notification arrives on the phone. Tapping it opens the order. |
| NT-08 | Leave three notifications unread with the app installed. | The app's icon shows **3**. With ten or more it shows **9**. Reading them clears it. |
| NT-09 | With the app open, receive a notification. | A pop-up and a short chime. New orders (vendors), nearby orders (riders) and "Your rider is around" (customers) get a longer chime. |
| NT-10 | Turn the phone's connection off and open the app. | A "You're offline" page with **Try again**. |
| NT-11 | Open any Cydex email. | The same layout every time: green Cydex header, heading, the message, a highlighted box for codes or amounts, a button, and a footer with usecydex.com. |
| NT-12 | Switch the app to dark mode and go through the main pages. | All text is readable. Nothing is dark-on-dark or light-on-light. |

---

## 18. Things that should be refused

These check that the rules can't be got around. Each should fail with a clear message.

| ID | Try to… | What should happen |
|---|---|---|
| NG-01 | Order from a closed vendor. | Refused: the vendor is closed. |
| NG-02 | Order when no rider who can cover the trip is online. | Refused before payment, with the "riders are busy" message. |
| NG-03 | Order from a vendor too far for every delivery mode. | The vendor isn't listed. If reached another way, the order is refused with the real limit. |
| NG-04 | Pick a delivery mode that doesn't reach. | It can't be selected. |
| NG-05 | Order more of a product than is in stock. | Refused, saying how many are left. |
| NG-06 | Complete a delivery with a wrong code. | "Incorrect". After 5 wrong tries the code is locked until an admin unlocks it. |
| NG-07 | As a vendor, see the customer's delivery code. | It's never shown to the vendor. |
| NG-08 | As a rider not yet verified, see Available Orders. | Nothing is listed, and they can't accept deliveries. |
| NG-09 | Use a coupon after its limit is reached. | Refused, with the reason. |
| NG-10 | Withdraw less than ₦3,000 as a vendor or rider. | Refused. |
| NG-11 | Withdraw more than the available balance. | Refused. |
| NG-12 | Open an admin page as a customer, vendor or rider. | Sent away from it. |
| NG-13 | Open another customer's order by changing the link. | "Order not found". |
| NG-14 | Send a rider request or Cydex Express delivery without the recipient's email. | The form can't be sent. |
| NG-15 | Add more than 5 drop-offs to a batch. | Not allowed. |
| NG-16 | Cancel a customer order after the vendor accepted, or an Express delivery after a rider accepted. | No cancel button. |
