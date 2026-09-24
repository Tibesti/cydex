# Cydex User Journey Maps

This document outlines the complete step-by-step journeys for all three user types in the Cydex platform.

---

## 1. Restaurant (Vendor) Journey

### 1.1 How They Receive Orders

**Step 1: Order Notification**
- Vendor receives a notification when a new order is placed
- Order appears in the vendor dashboard (`/vendor/orders`)
- Order status: `pending`
- Payment status must be `paid` before vendor can accept

**Step 2: View Order Details**
- Vendor clicks on the order to view full details
- Can see:
  - Order number
  - Customer information (name, phone, address)
  - Order items with quantities and prices
  - Delivery address and special instructions
  - Total amount and payment status
  - Order timestamp

**Implementation Reference:**
- `src/pages/vendor/Orders.tsx`
- `src/components/vendor/OrdersPageReal.tsx`
- `src/hooks/useVendorOrders.ts`

---

### 1.2 How They Accept/Prepare

**Step 1: Accept Order**
- Vendor clicks "Accept" button on pending orders
- Order status changes from `pending` to `processing`
- `vendor_accepted_at` timestamp is recorded
- A delivery record is automatically created in the `deliveries` table with status `available`
- Customer is notified that vendor has accepted the order

**Step 2: Prepare Order**
- Vendor updates order status to `ready_for_pickup` when order is ready
- This can be done via:
  - Order detail page action button
  - Quick action on orders list
- Rider is notified that order is ready for pickup

**Step 3: Track Preparation Status**
- Vendor can see order status in real-time
- Status progression: `pending` → `processing` → `ready_for_pickup`

**Implementation Reference:**
- `src/components/vendor/OrdersPageReal.tsx` (lines 112-135)
- `src/hooks/useVendorOrders.ts`
- Database trigger: `create_delivery_for_order()` in migrations

---

### 1.3 How They Track Riders

**Step 1: Rider Assignment Notification**
- When a rider accepts the delivery, vendor receives a notification
- Order status changes to `rider_assigned`
- `rider_assigned_at` timestamp is recorded

**Step 2: View Rider Information**
- Vendor can see rider details in order detail page:
  - Rider name
  - Rider phone number
  - Rider rating
  - Estimated pickup time

**Step 3: Monitor Rider Status**
- Vendor can track when rider:
  - Starts heading to restaurant (`picking_up`)
  - Arrives and picks up order (`picked_up`)
  - Starts delivery (`delivering`)
  - Completes delivery (`delivered`)

**Implementation Reference:**
- `src/components/vendor/OrderDetailReal.tsx`
- `src/pages/vendor/OrderDetail.tsx`
- Notification system in `supabase/migrations/20250716171032-*.sql`

---

### 1.4 How They Hand Over the Package

**Step 1: Order Ready Confirmation**
- Vendor marks order as `ready_for_pickup`
- Rider is notified to proceed to restaurant

**Step 2: Rider Arrival**
- When rider arrives, they update status to `picking_up`
- Vendor can see rider is en route or arrived

**Step 3: Package Handover**
- Rider confirms pickup by updating status to `picked_up`
- Order status changes to `out_for_delivery`
- Vendor receives confirmation that package has been handed over
- Verification code is generated and shared with customer

**Implementation Reference:**
- Delivery status updates in `src/hooks/rider/useRiderDeliveries.ts`
- Order status synchronization in database triggers

---

### 1.5 How They Get Paid

**Step 1: Order Completion**
- When order is marked as `delivered`, vendor's earnings are calculated
- Earnings include:
  - Product sales amount (subtotal)
  - Less platform commission (if applicable)

**Step 2: Earnings Tracking**
- Vendor can view earnings in Wallet page (`/vendor/wallet`)
- Real-time balance updates:
  - Total balance
  - Available for payout
  - Sales this month
  - Transaction history

**Step 3: Payout Process**
- Vendor can request payouts to registered bank accounts
- Payout process:
  1. Add bank account (if not already added)
  2. Request payout with amount
  3. 1.5% processing fee is applied
  4. Payout status tracked (pending → completed)

**Step 4: Transaction History**
- All transactions are logged:
  - Sales (incoming)
  - Payouts (outgoing)
  - Refunds (if any)
- Each transaction shows:
  - Amount
  - Status (completed, pending, failed)
  - Timestamp
  - Transaction ID

**Implementation Reference:**
- `src/pages/vendor/Wallet.tsx`
- `src/hooks/useVendorFinancials.ts`
- `vendor_wallet` and `vendor_transactions` tables

---

## 2. The Rider Journey

### 2.1 How a Rider Gets Notified

**Step 1: Available Deliveries**
- Rider sees available deliveries when:
  - Order status is `processing` or `ready_for_pickup`
  - Payment status is `paid`
  - No rider has been assigned yet
  - Delivery status is `available`

**Step 2: Notification Methods**
- Real-time updates via Supabase subscriptions
- Dashboard shows available orders count
- Available Orders page (`/rider/available`) lists all open deliveries
- Each delivery shows:
  - Pickup location (vendor address)
  - Delivery location (customer address)
  - Estimated delivery fee
  - Distance
  - Order items summary

**Step 3: Auto-Refresh**
- Available deliveries refresh automatically
- Real-time subscriptions update when new deliveries are created

**Implementation Reference:**
- `src/pages/rider/AvailableOrders.tsx`
- `src/hooks/rider/useRiderDeliveries.ts` (fetchAvailableDeliveries)
- `src/hooks/useRiderData.ts` (real-time subscriptions)

---

### 2.2 How They Accept a Job

**Step 1: Review Delivery Details**
- Rider clicks on available delivery to see:
  - Customer name and address
  - Vendor name and pickup location
  - Order items
  - Special instructions
  - Estimated earnings

**Step 2: Accept Delivery**
- Rider clicks "Accept" button
- System updates:
  - `deliveries.rider_id` = rider's user ID
  - `deliveries.status` = `accepted`
  - `deliveries.accepted_at` = current timestamp
  - `orders.rider_id` = rider's user ID
  - `orders.status` = `rider_assigned`
  - `orders.rider_assigned_at` = current timestamp

**Step 3: Confirmation & Redirect**
- Rider is redirected to order detail page (`/rider/order/:orderId`)
- Customer and vendor are notified of rider assignment
- Verification code is generated for the order

**Implementation Reference:**
- `src/hooks/rider/useRiderDeliveries.ts` (acceptDelivery function, lines 209-311)
- `src/pages/rider/AvailableOrders.tsx` (handleAcceptOrder, lines 96-113)

---

### 2.3 How They Navigate to the Restaurant

**Step 1: Start Pickup**
- Rider clicks "Start Pickup" button
- Delivery status changes to `picking_up`
- Order status remains `rider_assigned` or `ready_for_pickup`

**Step 2: Navigation**
- Rider can use:
  - In-app map integration (if implemented)
  - External navigation apps (Google Maps, etc.)
  - Vendor address from order details

**Step 3: En Route Status**
- Rider's status shows as "Picking Up"
- Vendor can see rider is heading to restaurant
- Customer can see rider is heading to pickup location

**Implementation Reference:**
- `src/pages/rider/OrderDetail.tsx` (handleStatusUpdate, lines 46-59)
- `src/pages/rider/CurrentDeliveries.tsx` (getNextAction, lines 62-72)
- `src/components/rider/dashboard/CurrentDeliveryCard.tsx`

---

### 2.4 How They Pick Up

**Step 1: Arrive at Restaurant**
- Rider arrives at vendor location
- Can contact vendor via phone if needed

**Step 2: Confirm Pickup**
- Rider clicks "Mark Picked Up" button
- Delivery status changes to `picked_up`
- Order status changes to `out_for_delivery`
- Pickup timestamp is recorded

**Step 3: Verification**
- Rider receives verification code (displayed in order details)
- This code will be needed to complete delivery

**Implementation Reference:**
- `src/pages/rider/OrderDetail.tsx` (lines 85-89, 222-225)
- `src/pages/rider/CurrentDeliveries.tsx` (handleStatusUpdate, lines 74-90)
- Status flow: `accepted` → `picking_up` → `picked_up` → `delivering` → `delivered`

---

### 2.5 How They Deliver to the Customer

**Step 1: Start Delivery**
- After marking as picked up, rider clicks "Start Delivery"
- Delivery status changes to `delivering`
- Order status remains `out_for_delivery`

**Step 2: Navigate to Customer**
- Rider navigates to customer's delivery address
- Can contact customer via phone if needed
- Customer can track rider's location (if real-time tracking is enabled)

**Step 3: Arrive at Customer Location**
- Rider arrives at delivery address
- Ready to complete delivery

**Implementation Reference:**
- `src/pages/rider/OrderDetail.tsx`
- `src/pages/rider/CurrentDeliveries.tsx`
- Customer tracking in `src/pages/customer/OrderDetail.tsx`

---

### 2.6 How They Complete the Order and Get Earnings

**Step 1: Delivery Verification**
- Rider asks customer for 4-digit verification code
- Rider enters code in verification input field
- System validates code matches order's `verification_code`

**Step 2: Complete Delivery**
- Upon successful verification:
  - Delivery status changes to `delivered`
  - Order status changes to `delivered`
  - `delivered_at` timestamp is recorded
  - Earnings are calculated and added to rider's account

**Step 3: Earnings Calculation**
- Earnings include:
  - Base delivery fee
  - Eco bonus (based on vehicle type and carbon savings)
  - Tips (if customer added)
- Earnings are recorded in `rider_earnings` table

**Step 4: View Earnings**
- Rider can view earnings in Earnings page (`/rider/earnings`)
- Breakdown shows:
  - Today's earnings
  - Weekly earnings
  - Monthly earnings
  - Delivery fees
  - Eco bonuses
  - Total deliveries completed

**Step 5: Withdraw Earnings**
- Rider can withdraw earnings to bank account
- Available balance shown in earnings dashboard
- Withdrawal requests processed (implementation may vary)

**Implementation Reference:**
- `src/components/rider/VerificationInput.tsx`
- `src/pages/rider/Earnings.tsx`
- `src/hooks/rider/useRiderEarnings.ts`
- `src/pages/rider/OrderDetail.tsx` (verification flow)

---

## 3. The End Customer Journey

### 3.1 How They Place an Order

**Step 1: Browse Vendors**
- Customer navigates to New Order page (`/customer/new-order`)
- Sees list of available vendors
- Can filter by category, search by name

**Step 2: Select Vendor**
- Customer clicks on a vendor
- Vendor's product catalog is displayed
- Products organized by categories

**Step 3: Add Items to Cart**
- Customer browses products
- Adds items to cart with quantities
- Can view cart summary
- All items must be from the same vendor

**Step 4: Set Delivery Address**
- Customer selects or adds delivery address
- Address modal appears if no address is set
- Address is saved for future orders

**Step 5: Review Order**
- Customer reviews:
  - Order items and quantities
  - Subtotal
  - Delivery fee (₦500)
  - Total amount
  - Delivery address

**Step 6: Proceed to Payment**
- Customer clicks "Checkout" or "Place Order"
- System validates:
  - User is logged in
  - Cart is not empty
  - Vendor is selected
  - Phone number is in profile
  - Delivery address is set

**Step 7: Create Order**
- Order is created with status `pending`
- Order number is generated
- Order items are saved
- Order ID is stored for payment

**Implementation Reference:**
- `src/pages/customer/NewOrder.tsx` (handleCheckout, lines 179-230)
- `src/pages/customer/NewOrder.tsx` (createOrderWithAddress, lines 245-320)
- Cart context: `src/contexts/CartContext.tsx`

---

### 3.2 How They Pay

**Step 1: Payment Modal**
- Payment modal opens automatically after order creation
- Shows order summary and total amount

**Step 2: Paystack Integration**
- Customer enters payment details via Paystack
- Payment methods supported:
  - Card payments
  - Bank transfer
  - Other Paystack-supported methods

**Step 3: Payment Processing**
- Payment is processed through Paystack
- Payment reference is generated
- Payment status is tracked

**Step 4: Payment Confirmation**
- On successful payment:
  - `payment_status` = `paid`
  - `payment_reference` = Paystack reference
  - Order status remains `pending` (waits for vendor acceptance)
  - Customer receives confirmation

**Step 5: Post-Payment**
- Rating modal may appear (for vendor rating)
- Customer is redirected to orders page
- Order confirmation page shows order details

**Implementation Reference:**
- `src/components/customer/PaymentModal.tsx`
- `src/pages/customer/NewOrder.tsx` (handlePaymentSuccess, lines 322-361)
- `src/services/paymentService.ts`
- `src/hooks/usePaystack.ts`

---

### 3.3 How They Track the Order

**Step 1: Order List**
- Customer views all orders in Orders page (`/customer/orders`)
- Orders filtered by status:
  - Active (pending, processing, ready, out_for_delivery)
  - Completed (delivered)
  - Cancelled

**Step 2: Order Detail Page**
- Customer clicks on order to see details
- Order detail page shows:
  - Order tracking timeline with steps
  - Order information cards
  - Rider information (when assigned)
  - Order items list
  - Order summary

**Step 3: Tracking Timeline**
- Visual timeline shows order progress:
  1. **Order Placed** - Always completed
  2. **Payment Confirmed** - When payment_status = paid
  3. **Vendor Accepted** - When status = processing/ready/out_for_delivery/delivered
  4. **Rider Assigned** - When rider_id is set
  5. **Order Picked Up** - When status = out_for_delivery/delivered
  6. **Out for Delivery** - When status = out_for_delivery
  7. **Delivered** - When status = delivered

**Step 4: Real-Time Updates**
- Order status updates in real-time via Supabase subscriptions
- Customer receives notifications for status changes
- Timeline updates automatically

**Step 5: Verification Code Display**
- When rider is assigned, verification code is displayed
- Customer can copy code to share with rider
- Code is needed to complete delivery

**Implementation Reference:**
- `src/pages/customer/OrderDetail.tsx`
- `src/pages/customer/Orders.tsx`
- `src/components/customer/OrderTrackingTimeline.tsx`
- `src/components/customer/VerificationCodeDisplay.tsx`
- `src/hooks/useCustomerOrders.ts`

---

### 3.4 How They Receive It

**Step 1: Rider Assignment Notification**
- Customer receives notification when rider is assigned
- Verification code is shared with customer

**Step 2: Rider En Route**
- Customer can see rider is heading to restaurant
- Then rider is picking up order
- Then rider is delivering

**Step 3: Rider Arrives**
- Rider arrives at delivery address
- Rider contacts customer (if needed)

**Step 4: Delivery Verification**
- Rider asks for verification code
- Customer provides 4-digit code
- Rider enters code to verify delivery

**Step 5: Order Completion**
- Upon successful verification:
  - Order status changes to `delivered`
  - `delivered_at` timestamp is recorded
  - Customer receives delivery confirmation
  - Order moves to "Completed" section

**Implementation Reference:**
- Order status flow in database
- Verification code system
- `src/components/customer/VerificationCodeDisplay.tsx`

---

### 3.5 How They Pay

**Payment occurs BEFORE order is placed** (see section 3.2)

**Additional Payment Details:**
- Payment is required upfront via Paystack
- Order is only created after successful payment
- Payment status is tracked throughout order lifecycle
- Refunds can be processed if order is cancelled (implementation may vary)

**Implementation Reference:**
- `src/services/paymentService.ts`
- `src/services/webhookHandler.ts` (Paystack webhooks)
- Payment verification in `src/lib/paystack.ts`

---

### 3.6 How They Give Feedback or Report Issues

**Step 1: Rating Vendor**
- After order placement, rating modal may appear
- Customer can rate vendor (1-5 stars)
- Rating is saved to database

**Step 2: Order Feedback**
- On completed orders, customer can:
  - Rate the delivery experience
  - Leave comments/feedback
  - Report issues

**Step 3: Issue Reporting**
- Customer can report issues via:
  - Order detail page (if implemented)
  - Contact support
  - Customer service channels

**Step 4: Reorder**
- Customer can reorder from order detail page
- "Reorder" button adds previous items to cart

**Implementation Reference:**
- Rating system in `src/pages/customer/NewOrder.tsx` (rating modal)
- `src/components/customer/OrderDetailsContent.tsx` (onReorder)
- Feedback collection (implementation may vary)

---

## Order Status Flow Summary

### Complete Status Progression:

```
Customer Side:
pending → processing → ready_for_pickup → rider_assigned → out_for_delivery → delivered

Vendor Side:
pending → processing → ready_for_pickup → (rider picks up) → delivered

Rider Side:
available → accepted → picking_up → picked_up → delivering → delivered
```

### Key Timestamps:
- `created_at` - Order placed
- `vendor_accepted_at` - Vendor accepts order
- `rider_assigned_at` - Rider accepts delivery
- `picked_up_at` - Rider picks up from vendor
- `delivered_at` - Order delivered to customer

### Payment Flow:
1. Customer places order → Order created with `payment_status: pending`
2. Customer pays via Paystack → `payment_status: paid`
3. Vendor can now accept order
4. Order proceeds through delivery flow

---

## Database Tables Involved

- `orders` - Main order records
- `order_items` - Order line items
- `deliveries` - Delivery assignments
- `profiles` - User profiles (customers, vendors, riders)
- `vendor_wallet` - Vendor earnings
- `vendor_transactions` - Vendor financial transactions
- `rider_earnings` - Rider earnings records
- `order_notifications` - Notifications for all parties
- `products` - Vendor products

---

## Real-Time Features

- Supabase real-time subscriptions for:
  - Order status changes
  - Delivery status updates
  - New available deliveries (for riders)
  - Earnings updates
  - Notification updates

---

## Notes

- All timestamps are stored in ISO format
- Verification codes are 4-digit numeric codes
- Delivery fee is currently fixed at ₦500
- Platform takes 10% commission from vendor sales
- Eco bonuses for riders: 5% of delivery fee
- Payout fee: 1.5% for both vendors and riders
- All amounts in Nigerian Naira (₦)

---

## Wallet & Payment System Details

### Payment Flow with Escrow

1. **Customer Payment**
   - Customer pays via Paystack
   - Payment amount held in escrow (not immediately released)
   - Payment reference and metadata stored
   - Customer transaction record created
   - Order status remains `pending` until vendor accepts

2. **Escrow Hold**
   - When payment confirmed (`payment_status = paid`):
     - `payment_holds` record created automatically via database trigger
     - Calculates: vendor amount (90%), rider amount (100% of delivery fee), platform fee (10%)
     - Status: `held`
   - Funds remain held until order is delivered

3. **Settlement on Delivery**
   - When order status changes to `delivered`:
     - Database trigger automatically processes settlement
     - Creates settlement records for vendor and rider
     - Updates vendor and rider wallets
     - Creates transaction records
     - Releases funds from escrow
     - Payment hold status changes to `released`

### Wallet System

#### Vendor Wallet
- **Available Balance**: Funds available for payout
- **Pending Balance**: Orders paid but not yet delivered
- **Total Earned**: Lifetime earnings
- **Total Withdrawn**: Lifetime withdrawals

#### Rider Wallet
- **Available Balance**: Earnings available for withdrawal
- **Pending Balance**: Deliveries in progress
- **Total Earned**: Lifetime earnings
- **Total Withdrawn**: Lifetime withdrawals
- **Carbon Credits**: Eco points earned

#### Customer Wallet
- **Available Balance**: Wallet credits/refunds
- **Bonus Balance**: Promotional credits
- **Carbon Credits**: Eco points for sustainable choices
- **Total Spent**: Lifetime spending

### Transaction Types

#### Vendor Transactions
- `sale`: Income from completed orders (status: completed)
- `payout`: Withdrawals to bank account (status: pending/completed/failed)
- `refund`: Order cancellations/refunds (status: completed)
- `adjustment`: Manual corrections (admin only)

#### Rider Transactions
- `earning`: Income from completed deliveries (status: completed)
- `withdrawal`: Payouts to bank account (status: pending/completed/failed)
- `bonus`: Eco bonuses and incentives (status: completed)
- `adjustment`: Manual corrections (admin only)
- `refund`: Reversed earnings (rare)

#### Customer Transactions
- `payment`: Order payments (status: completed)
- `refund`: Cancelled order refunds (status: completed)
- `bonus`: Promotional credits (status: completed)
- `reward`: Loyalty rewards (status: completed)
- `adjustment`: Manual corrections (admin only)

### Payout Process

#### Vendor Payout
1. Vendor requests payout from Wallet page
2. Selects bank account and amount
3. System validates available balance
4. Calculates 1.5% processing fee
5. Creates `vendor_payout_requests` record with status `pending`
6. Deducts amount from available balance immediately
7. Admin/System processes payout (status: `processing` → `completed`)
8. If successful: creates transaction record
9. If failed: returns amount to available balance

#### Rider Payout
1. Rider requests payout from Earnings/Wallet page
2. Selects bank account and amount
3. System validates available balance
4. Calculates 1.5% processing fee
5. Creates `rider_payout_requests` record with status `pending`
6. Deducts amount from available balance immediately
7. Admin/System processes payout (status: `processing` → `completed`)
8. If successful: creates transaction record
9. If failed: returns amount to available balance

### Settlement Calculations

#### Order Settlement Example (₦5,000 order)
```
Subtotal: ₦4,500
Delivery Fee: ₦500
Total: ₦5,000

On Delivery:
- Vendor: ₦4,500 × 0.90 = ₦4,050 (90%)
- Platform: ₦4,500 × 0.10 = ₦450 (10%)
- Rider Base: ₦500 (100% of delivery fee)
- Rider Eco Bonus: ₦500 × 0.05 = ₦25 (5%)
- Rider Total: ₦525
```

### Refund Policy

**Eligibility:**
- Order not yet delivered
- Payment confirmed
- Within 24 hours of order placement

**Process:**
1. Check refund eligibility via `settlementService.canRefundOrder()`
2. If eligible:
   - Update payment hold status to `refunded`
   - Create customer refund transaction
   - Update order status to `cancelled` and payment_status to `refunded`
   - Return funds to customer
3. If ineligible: reject refund request

### Database Tables for Wallet System

#### Core Tables
- `vendor_wallet` - Vendor balance tracking
- `rider_wallet` - Rider balance tracking
- `customer_wallet` - Customer balance tracking
- `payment_holds` - Escrow fund tracking
- `settlements` - Settlement records for all parties

#### Transaction Tables
- `vendor_transactions` - Vendor financial transactions
- `vendor_payout_requests` - Vendor withdrawal requests
- `rider_transactions` - Rider financial transactions
- `rider_earnings` - Detailed earnings per delivery
- `rider_payout_requests` - Rider withdrawal requests
- `customer_transactions` - Customer payment history

#### Supporting Tables
- `vendor_bank_accounts` - Vendor payout destinations
- `rider_bank_details` - Rider payout destinations

### Implementation References

**Services:**
- `src/services/settlementService.ts` - Core settlement logic
- `src/services/paymentService.ts` - Paystack integration
- `src/services/webhookHandler.ts` - Payment webhook processing

**Hooks:**
- `src/hooks/useVendorFinancials.ts` - Vendor wallet management
- `src/hooks/useCustomerWallet.ts` - Customer wallet management
- `src/hooks/rider/useRiderEarnings.ts` - Rider earnings management

**Pages:**
- `src/pages/vendor/Wallet.tsx` - Vendor wallet interface
- `src/pages/rider/Earnings.tsx` - Rider earnings interface
- `src/pages/customer/Wallet.tsx` - Customer wallet interface

**Database:**
- `supabase/migrations/20250120000000_wallet_payment_enhancement.sql` - Wallet system migration

### Automated Settlement Triggers

**Database Triggers:**
1. `create_payment_hold_trigger`: Creates escrow hold when payment confirmed
2. `process_order_settlement_trigger`: Releases funds and settles when order delivered

**Functions:**
- `create_payment_hold()`: Creates payment hold record
- `process_order_settlement()`: Handles settlement distribution
- `calculate_settlement_amounts()`: Calculates vendor/rider/platform split
- `get_wallet_balance()`: Retrieves wallet balance by user role

### Security Features

1. **Row Level Security (RLS)**: All wallet tables have RLS policies
2. **User Isolation**: Users can only access their own wallet data
3. **Admin Oversight**: Admins have read access to all financial data
4. **System Operations**: Settlement automation runs with system privileges
5. **Transaction Logging**: All financial operations are logged
6. **Webhook Verification**: Paystack webhook signatures validated (production)

### Real-Time Updates

**Supabase Subscriptions:**
- Wallet balances update in real-time
- Transaction history refreshes automatically
- Payout request status updates instantly
- Settlement notifications pushed to users

### Error Handling

**Payment Failures:**
- Webhook handler logs all payment events
- Failed payments recorded in `payment_logs`
- Orders remain in `pending` state
- Users notified of payment issues

**Settlement Failures:**
- Errors logged to console and monitoring
- Settlement status marked as `failed`
- Manual intervention required
- Audit trail maintained

### Future Enhancements

**Planned Features:**
1. Paystack Transfer API integration for automated payouts
2. Multi-currency support
3. Wallet-to-wallet transfers
4. Scheduled automatic payouts
5. Dynamic commission rates
6. Referral bonuses
7. Loyalty program integration
8. Advanced analytics dashboards

