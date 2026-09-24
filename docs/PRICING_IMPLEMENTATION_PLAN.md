# Cydex Logistics Pricing Model Implementation Plan

## Phase 1: Database Schema (Week 1)

### 1.1 Create Pricing Configuration Table
```sql
CREATE TABLE IF NOT EXISTS public.pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_rate DECIMAL(10,2) DEFAULT 200.00,
  distance_rate_per_km DECIMAL(10,2) DEFAULT 75.00,
  weight_rates JSONB DEFAULT '{"0.5-5": 100, "5-10": 300}',
  late_night_fee DECIMAL(10,2) DEFAULT 100.00,
  surge_multiplier DECIMAL(3,2) DEFAULT 1.20,
  student_discount_percent DECIMAL(3,2) DEFAULT 0.10,
  green_fee DECIMAL(10,2) DEFAULT 20.00,
  subscription_monthly_rate DECIMAL(10,2) DEFAULT 1000.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.2 Create Student Subscriptions Table
```sql
CREATE TABLE IF NOT EXISTS public.student_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.profiles(id),
  status VARCHAR(20) DEFAULT 'active',
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  payment_reference VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.3 Update Orders Table
```sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS base_rate DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS distance_fee DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS weight_fee DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS late_night_fee DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS surge_fee DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS student_discount DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS green_fee DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS distance_km DECIMAL(5,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(5,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_late_night BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_peak_hour BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_student_order BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subscription_applied BOOLEAN DEFAULT FALSE;
```

## Phase 2: Backend Services (Week 1)

### 2.1 Create Pricing Service
**File: `src/services/pricingService.ts`**
- Load pricing configuration from database
- Calculate price based on distance, weight, time, student status
- Handle subscription discounts
- Return detailed breakdown

### 2.2 Create Student Verification Service
**File: `src/services/studentVerificationService.ts`**
- Verify @ui.edu.ng email domains
- Check active subscription status
- Validate student eligibility for discounts

### 2.3 Create Distance Service
**File: `src/services/distanceService.ts`**
- Integrate with Google Maps Distance Matrix API
- Calculate delivery distances
- Determine peak hours and late night periods

## Phase 3: Frontend Components (Week 2)

### 3.1 Pricing Calculator Component
**File: `src/components/pricing/PricingCalculator.tsx`**
- Input fields for pickup/delivery addresses
- Weight and time options
- Student status toggle
- Real-time price calculation
- Detailed breakdown display

### 3.2 Subscription Management Component
**File: `src/components/pricing/SubscriptionForm.tsx`**
- UI student email verification
- Monthly subscription signup
- Paystack payment integration
- Subscription status display

## Phase 4: API Routes (Week 2)

### 4.1 Price Calculation API
**File: `src/pages/api/calculate-price.ts`**
- Accept delivery parameters
- Calculate distance using Google Maps
- Apply pricing rules and discounts
- Return total price and breakdown

### 4.2 Distance Calculation API
**File: `src/pages/api/calculate-distance.ts`**
- Google Maps Distance Matrix integration
- Return distance in kilometers
- Handle API errors gracefully

### 4.3 Subscription API
**File: `src/pages/api/subscribe.ts`**
- Validate UI student email
- Create subscription record
- Initialize Paystack payment
- Handle payment callbacks

## Phase 5: Order Flow Integration (Week 3)

### 5.1 Update NewOrder Page
- Add pricing calculator to order flow
- Pre-calculate delivery costs
- Show price breakdown before checkout

### 5.2 Update Order Confirmation
- Include pricing details in order data
- Store breakdown in database
- Display transparent pricing to customer

### 5.3 Update Vendor Dashboard
- Show pricing information on orders
- Display distance and weight details
- Track subscription orders

## Phase 6: Testing (Week 4)

### 6.1 Unit Tests
- Pricing calculation accuracy
- Student verification logic
- Distance calculation precision

### 6.2 Integration Tests
- Complete order flow with pricing
- Paystack payment processing
- Database operations

### 6.3 User Testing
- Test with UI students
- Validate pricing transparency
- Verify discount applications

## Phase 7: Deployment (Week 4)

### 7.1 Environment Setup
```bash
GOOGLE_MAPS_API_KEY=your_key
PAYSTACK_SECRET_KEY=your_key
PAYSTACK_PUBLIC_KEY=your_key
```

### 7.2 Database Migration
```bash
supabase db push
```

### 7.3 Vercel Deployment
```bash
vercel --prod
```

## Key Features Implemented

1. **Tiered Pricing Model**
   - Base rate: ₦200 (up to 2km, <0.5kg)
   - Distance: ₦75 per additional km
   - Weight: ₦100 (0.5-5kg), ₦300 (5-10kg)
   - Late night: ₦100 (8 PM - 6 AM)
   - Peak hour: +20% (12 PM - 2 PM)

2. **Student Benefits**
   - 10% discount for @ui.edu.ng emails
   - ₦1,000/month subscription for unlimited deliveries
   - Automatic student verification

3. **Transparency**
   - Real-time price calculation
   - Detailed breakdown display
   - No hidden fees

4. **Sustainability**
   - Optional ₦20 green fee
   - Supports eco-friendly initiatives

## Success Metrics

- 90%+ pricing accuracy
- <2 second API response times
- 95%+ student discount success rate
- 10%+ subscription adoption
- 50%+ reduction in pricing queries

## Timeline: 4 weeks total
- Week 1: Database & Backend
- Week 2: Frontend & APIs
- Week 3: Integration
- Week 4: Testing & Deployment 