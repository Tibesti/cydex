# Cydex Logistics Pricing Model Implementation Plan

## Overview
This document outlines the step-by-step implementation of the tiered pricing model for Cydex Logistics, replacing the previous ₦500 flat rate with a dynamic, student-friendly pricing structure.

## Phase 1: Database Schema Updates

### Step 1.1: Create Pricing Configuration Table
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Step 1.2: Create Student Subscriptions Table
```sql
CREATE TABLE IF NOT EXISTS public.student_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_type VARCHAR(50) DEFAULT 'monthly',
  status VARCHAR(20) DEFAULT 'active',
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  payment_reference VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Step 1.3: Update Orders Table
```sql
-- Add pricing-related columns to existing orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS base_rate DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS distance_fee DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS weight_fee DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS late_night_fee DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS surge_fee DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS student_discount DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS green_fee DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS distance_km DECIMAL(5,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(5,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_late_night BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_peak_hour BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_student_order BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subscription_applied BOOLEAN DEFAULT FALSE;
```

## Phase 2: Backend Services Implementation

### Step 2.1: Create Pricing Service
**File: `src/services/pricingService.ts`**

```typescript
interface PricingConfig {
  base_rate: number;
  distance_rate_per_km: number;
  weight_rates: { [key: string]: number };
  late_night_fee: number;
  surge_multiplier: number;
  student_discount_percent: number;
  green_fee: number;
  subscription_monthly_rate: number;
}

interface PricingRequest {
  distance_km: number;
  weight_kg: number;
  is_late_night: boolean;
  is_peak_hour: boolean;
  is_student: boolean;
  include_green_fee: boolean;
  subscription_applied: boolean;
}

export class PricingService {
  private config: PricingConfig;

  async loadConfig(): Promise<void> {
    const { data, error } = await supabase
      .from('pricing_config')
      .select('*')
      .single();
    
    if (error) throw error;
    this.config = data;
  }

  calculatePrice(request: PricingRequest): number {
    let total = this.config.base_rate;

    // Distance fee
    if (request.distance_km > 2) {
      total += (request.distance_km - 2) * this.config.distance_rate_per_km;
    }

    // Weight fee
    if (request.weight_kg > 0.5) {
      if (request.weight_kg <= 5) {
        total += this.config.weight_rates['0.5-5'];
      } else if (request.weight_kg <= 10) {
        total += this.config.weight_rates['5-10'];
      }
    }

    // Late night fee
    if (request.is_late_night) {
      total += this.config.late_night_fee;
    }

    // Surge pricing
    if (request.is_peak_hour) {
      total *= this.config.surge_multiplier;
    }

    // Student discount
    if (request.is_student && !request.subscription_applied) {
      total *= (1 - this.config.student_discount_percent);
    }

    // Green fee
    if (request.include_green_fee) {
      total += this.config.green_fee;
    }

    return Math.round(total * 100) / 100; // Round to 2 decimal places
  }
}
```

### Step 2.2: Create Student Verification Service
**File: `src/services/studentVerificationService.ts`**

```typescript
export class StudentVerificationService {
  async verifyStudentEmail(email: string): Promise<boolean> {
    return email.endsWith('@ui.edu.ng');
  }

  async checkActiveSubscription(studentId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('student_subscriptions')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'active')
      .gte('end_date', new Date().toISOString().split('T')[0])
      .single();

    return !error && !!data;
  }
}
```

### Step 2.3: Create Distance Calculation Service
**File: `src/services/distanceService.ts`**

```typescript
export class DistanceService {
  async calculateDistance(
    pickupAddress: string,
    deliveryAddress: string
  ): Promise<number> {
    // Integration with Google Maps Distance Matrix API
    const response = await fetch('/api/calculate-distance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickupAddress, deliveryAddress })
    });

    const data = await response.json();
    return data.distance_km;
  }

  isLateNight(): boolean {
    const hour = new Date().getHours();
    return hour >= 20 || hour < 6;
  }

  isPeakHour(): boolean {
    const hour = new Date().getHours();
    return hour >= 12 && hour <= 14; // 12 PM - 2 PM
  }
}
```

## Phase 3: Frontend Components Implementation

### Step 3.1: Create Pricing Calculator Component
**File: `src/components/pricing/PricingCalculator.tsx`**

```typescript
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PricingCalculatorProps {
  onPriceCalculated: (price: number, breakdown: any) => void;
}

export const PricingCalculator: React.FC<PricingCalculatorProps> = ({
  onPriceCalculated
}) => {
  const [formData, setFormData] = useState({
    pickupAddress: '',
    deliveryAddress: '',
    weightKg: 0.5,
    isLateNight: false,
    includeGreenFee: false,
    isStudent: false
  });

  const [price, setPrice] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const calculatePrice = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();
      setPrice(data.total_price);
      setBreakdown(data.breakdown);
      onPriceCalculated(data.total_price, data.breakdown);
    } catch (error) {
      console.error('Error calculating price:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Delivery Price Calculator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Pickup Address</label>
          <Input
            value={formData.pickupAddress}
            onChange={(e) => setFormData({...formData, pickupAddress: e.target.value})}
            placeholder="Enter pickup address"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Delivery Address</label>
          <Input
            value={formData.deliveryAddress}
            onChange={(e) => setFormData({...formData, deliveryAddress: e.target.value})}
            placeholder="Enter delivery address"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Weight (kg)</label>
          <Input
            type="number"
            step="0.1"
            min="0.1"
            max="10"
            value={formData.weightKg}
            onChange={(e) => setFormData({...formData, weightKg: parseFloat(e.target.value)})}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            checked={formData.isLateNight}
            onCheckedChange={(checked) => setFormData({...formData, isLateNight: checked})}
          />
          <label className="text-sm">Late Night Delivery (8 PM - 6 AM)</label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            checked={formData.includeGreenFee}
            onCheckedChange={(checked) => setFormData({...formData, includeGreenFee: checked})}
          />
          <label className="text-sm">Include Green Fee (₦20)</label>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            checked={formData.isStudent}
            onCheckedChange={(checked) => setFormData({...formData, isStudent: checked})}
          />
          <label className="text-sm">UI Student (@ui.edu.ng)</label>
        </div>

        <Button 
          onClick={calculatePrice} 
          disabled={loading || !formData.pickupAddress || !formData.deliveryAddress}
          className="w-full"
        >
          {loading ? 'Calculating...' : 'Calculate Price'}
        </Button>

        {price && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg">
            <h3 className="font-semibold text-lg">Total: ₦{price}</h3>
            {breakdown && (
              <div className="text-sm text-gray-600 mt-2">
                <div>Base Rate: ₦{breakdown.base_rate}</div>
                {breakdown.distance_fee > 0 && <div>Distance: ₦{breakdown.distance_fee}</div>}
                {breakdown.weight_fee > 0 && <div>Weight: ₦{breakdown.weight_fee}</div>}
                {breakdown.late_night_fee > 0 && <div>Late Night: ₦{breakdown.late_night_fee}</div>}
                {breakdown.surge_fee > 0 && <div>Peak Hour: ₦{breakdown.surge_fee}</div>}
                {breakdown.student_discount > 0 && <div>Student Discount: -₦{breakdown.student_discount}</div>}
                {breakdown.green_fee > 0 && <div>Green Fee: ₦{breakdown.green_fee}</div>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

### Step 3.2: Create Subscription Management Component
**File: `src/components/pricing/SubscriptionForm.tsx`**

```typescript
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export const SubscriptionForm: React.FC = () => {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubscribe = async () => {
    if (!email.endsWith('@ui.edu.ng')) {
      setMessage('Only UI students with @ui.edu.ng email can subscribe');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, userId: user?.id })
      });

      const data = await response.json();
      if (data.success) {
        setMessage('Subscription successful! Check your email for payment link.');
      } else {
        setMessage(data.error || 'Subscription failed');
      }
    } catch (error) {
      setMessage('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Student Monthly Subscription</CardTitle>
        <p className="text-sm text-gray-600">
          ₦1,000/month for unlimited standard deliveries
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">UI Email Address</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="yourname@ui.edu.ng"
          />
        </div>

        <Button 
          onClick={handleSubscribe} 
          disabled={loading || !email}
          className="w-full"
        >
          {loading ? 'Processing...' : 'Subscribe Now'}
        </Button>

        {message && (
          <div className={`p-3 rounded text-sm ${
            message.includes('successful') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {message}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

## Phase 4: API Routes Implementation

### Step 4.1: Create Price Calculation API
**File: `src/pages/api/calculate-price.ts`**

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { PricingService } from '@/services/pricingService';
import { DistanceService } from '@/services/distanceService';
import { StudentVerificationService } from '@/services/studentVerificationService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      pickupAddress,
      deliveryAddress,
      weightKg,
      isLateNight,
      includeGreenFee,
      isStudent,
      userId
    } = req.body;

    const pricingService = new PricingService();
    const distanceService = new DistanceService();
    const studentService = new StudentVerificationService();

    await pricingService.loadConfig();

    // Calculate distance
    const distanceKm = await distanceService.calculateDistance(
      pickupAddress,
      deliveryAddress
    );

    // Check if user has active subscription
    const hasSubscription = userId ? 
      await studentService.checkActiveSubscription(userId) : false;

    // Determine if it's late night or peak hour
    const isLateNightDelivery = isLateNight || distanceService.isLateNight();
    const isPeakHour = distanceService.isPeakHour();

    const price = pricingService.calculatePrice({
      distance_km: distanceKm,
      weight_kg: weightKg,
      is_late_night: isLateNightDelivery,
      is_peak_hour: isPeakHour,
      is_student: isStudent,
      include_green_fee: includeGreenFee,
      subscription_applied: hasSubscription
    });

    // Generate breakdown for transparency
    const breakdown = {
      base_rate: 200,
      distance_fee: distanceKm > 2 ? (distanceKm - 2) * 75 : 0,
      weight_fee: weightKg > 0.5 ? (weightKg <= 5 ? 100 : 300) : 0,
      late_night_fee: isLateNightDelivery ? 100 : 0,
      surge_fee: isPeakHour ? price * 0.2 : 0,
      student_discount: isStudent && !hasSubscription ? price * 0.1 : 0,
      green_fee: includeGreenFee ? 20 : 0
    };

    res.status(200).json({
      total_price: price,
      breakdown,
      distance_km: distanceKm,
      has_subscription: hasSubscription
    });
  } catch (error) {
    console.error('Price calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate price' });
  }
}
```

### Step 4.2: Create Distance Calculation API
**File: `src/pages/api/calculate-distance.ts`**

```typescript
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pickupAddress, deliveryAddress } = req.body;

    // Google Maps Distance Matrix API call
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(pickupAddress)}&destinations=${encodeURIComponent(deliveryAddress)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );

    const data = await response.json();
    
    if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
      const distanceKm = data.rows[0].elements[0].distance.value / 1000;
      res.status(200).json({ distance_km: distanceKm });
    } else {
      res.status(400).json({ error: 'Could not calculate distance' });
    }
  } catch (error) {
    console.error('Distance calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate distance' });
  }
}
```

### Step 4.3: Create Subscription AP
**File: `src/pages/api/subscribe.ts`**

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, userId } = req.body;

    if (!email.endsWith('@ui.edu.ng')) {
      return res.status(400).json({ error: 'Only UI students can subscribe' });
    }

    // Create subscription record
    const { data: subscription, error: subError } = await supabase
      .from('student_subscriptions')
      .insert({
        student_id: userId,
        subscription_type: 'monthly',
        status: 'pending',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      })
      .select()
      .single();

    if (subError) {
      return res.status(500).json({ error: 'Failed to create subscription' });
    }

    // Initialize Paystack payment
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        amount: 100000, // ₦1,000 in kobo
        callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/subscription-callback`,
        metadata: {
          subscription_id: subscription.id,
          user_id: userId
        }
      })
    });

    const paystackData = await paystackResponse.json();

    if (paystackData.status) {
      res.status(200).json({
        success: true,
        authorization_url: paystackData.data.authorization_url
      });
    } else {
      res.status(400).json({ error: 'Payment initialization failed' });
    }
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: 'Failed to process subscription' });
  }
}
```

## Phase 5: Integration with Existing Order Flow

### Step 5.1: Update Order Creation Process
**File: `src/pages/customer/NewOrder.tsx`**

```typescript
// Add pricing calculator to the order flow
import { PricingCalculator } from '@/components/pricing/PricingCalculator';

// In the component:
const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
const [priceBreakdown, setPriceBreakdown] = useState<any>(null);

const handlePriceCalculated = (price: number, breakdown: any) => {
  setCalculatedPrice(price);
  setPriceBreakdown(breakdown);
};

// Add pricing calculator to the UI
{selectedVendor && (
  <div className="mb-6">
    <PricingCalculator onPriceCalculated={handlePriceCalculated} />
  </div>
)}
```

### Step 5.2: Update Checkout Process
**File: `src/pages/customer/OrderConfirmation.tsx`**

```typescript
// Include pricing breakdown in order confirmation
const orderData = {
  // ... existing order data
  base_rate: priceBreakdown?.base_rate,
  distance_fee: priceBreakdown?.distance_fee,
  weight_fee: priceBreakdown?.weight_fee,
  late_night_fee: priceBreakdown?.late_night_fee,
  surge_fee: priceBreakdown?.surge_fee,
  student_discount: priceBreakdown?.student_discount,
  green_fee: priceBreakdown?.green_fee,
  total_amount: calculatedPrice,
  distance_km: priceBreakdown?.distance_km,
  weight_kg: selectedItems.reduce((sum, item) => sum + (item.weight || 0), 0),
  is_late_night: isLateNight(),
  is_peak_hour: isPeakHour(),
  is_student_order: user?.email?.endsWith('@ui.edu.ng') || false,
  subscription_applied: hasActiveSubscription
};
```

## Phase 6: Testing and Validation

### Step 6.1: Unit Tests
- Test pricing calculations with various scenarios
- Test student verification logic
- Test subscription management
- Test distance calculation accuracy

### Step 6.2: Integration Tests
- Test complete order flow with pricing
- Test Paystack payment integration
- Test Google Maps API integration
- Test database operations

### Step 6.3: User Acceptance Testing
- Test with UI students
- Validate pricing transparency
- Test subscription benefits
- Verify discount applications

## Phase 7: Deployment and Monitoring

### Step 7.1: Environment Configuration
```bash
# Add to .env.local
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
PAYSTACK_SECRET_KEY=your_paystack_secret_key
PAYSTACK_PUBLIC_KEY=your_paystack_public_key
NEXT_PUBLIC_BASE_URL=https://cydex-omega.vercel.app
```

### Step 7.2: Database Migration
```bash
# Run the SQL scripts from Phase 1
supabase db push
```

### Step 7.3: Vercel Deployment
```bash
# Deploy to production
vercel --prod
```

### Step 7.4: Monitoring Setup
- Set up Vercel Analytics
- Monitor API response times
- Track pricing calculation accuracy
- Monitor subscription uptake

## Timeline

- **Week 1**: Database schema and backend services
- **Week 2**: Frontend components and API routes
- **Week 3**: Integration with existing order flow
- **Week 4**: Testing and deployment
- **Week 5**: Monitoring and optimization

## Success Metrics

- 90%+ pricing calculation accuracy
- <2 second API response times
- 95%+ student discount application success
- 10%+ subscription adoption rate
- 50%+ reduction in customer support queries about pricing

This implementation plan provides a comprehensive roadmap for integrating the new pricing model into the existing Cydex Logistics platform while maintaining the current functionality and user experience. 