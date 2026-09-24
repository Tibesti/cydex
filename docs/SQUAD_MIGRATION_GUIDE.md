# Squad Payment Gateway Migration Guide

This guide explains how to switch from Paystack to Squad payment gateway and what you need to get from Squad.

## 📋 What You Need from 

### 1. **Squad Account Setup**
1. **Sign up for Squad**: Go to [https://squadco.com](https://squadco.com) and create an account
2. **Complete KYC**: Complete the Know Your Customer (KYC) verification process
3. **Access Dashboard**: Log into your Squad dashboard

### 2. **API Credentials** (Get from Squad Dashboard)

You need to get these from **Squad Dashboard → Settings → API Keys**:

#### For Testing (Sandbox/Test Mode):
```env
VITE_SQUAD_PUBLIC_KEY=your_test_public_key
VITE_SQUAD_SECRET_KEY=your_test_secret_key
VITE_SQUAD_API_URL=https://sandbox-api-demo.squadco.com
```

#### For Production (Live Mode):
```env
VITE_SQUAD_PROD_PUBLIC_KEY=your_live_public_key
VITE_SQUAD_PROD_SECRET_KEY=your_live_secret_key
VITE_SQUAD_API_URL=https://api.squadco.com
```

### 3. **Webhook Configuration** (Get from Squad Dashboard)

1. Go to **Squad Dashboard → Settings → Webhooks**
2. **Add Webhook URL**: 
   - For Supabase Edge Function: `https://your-project.supabase.co/functions/v1/squad-webhook`
   - For your own backend: `https://your-backend.com/api/webhooks/squad`
3. **Copy Webhook Secret**: Squad will generate a webhook secret
4. Add to your `.env`:
```env
VITE_SQUAD_WEBHOOK_SECRET=your_webhook_secret
```

### 4. **Squad API Endpoints You'll Use**

Based on Squad's API documentation, you'll need these endpoints:

- **Initialize Payment**: `POST /payment/initiate`
- **Verify Transaction**: `GET /transaction/verify/{reference}`
- **Webhook Events**: Receive webhooks at your configured URL

## 🔄 Migration Steps

### Step 1: Update Environment Variables

Create or update your `.env` file:

```env
# Squad Configuration (Replace Paystack variables)
VITE_SQUAD_PUBLIC_KEY=your_test_public_key_here
VITE_SQUAD_SECRET_KEY=your_test_secret_key_here
VITE_SQUAD_WEBHOOK_SECRET=your_webhook_secret_here
VITE_SQUAD_API_URL=https://sandbox-api-demo.squadco.com

# For Production
VITE_SQUAD_PROD_PUBLIC_KEY=your_live_public_key_here
VITE_SQUAD_PROD_SECRET_KEY=your_live_secret_key_here

# Remove or comment out old Paystack variables
# VITE_PAYSTACK_PUBLIC_KEY=...
# VITE_PAYSTACK_SECRET_KEY=...
# VITE_PAYSTACK_WEBHOOK_SECRET=...
```

### Step 2: Update Payment Service

The payment service has been updated to use Squad. Update `src/services/paymentService.ts` to import from `squadPaymentService`:

```typescript
// Change from:
import { paymentService } from '@/services/paymentService';

// To:
import { squadPaymentService as paymentService } from '@/services/squadPaymentService';
```

### Step 3: Update PaymentModal Component

Update `src/components/customer/PaymentModal.tsx` to use Squad's payment initialization instead of Paystack's React component.

### Step 4: Create Webhook Endpoint

You need to create a webhook endpoint to receive payment notifications from Squad.

**Option A: Supabase Edge Function** (Recommended)

Create `supabase/functions/squad-webhook/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SquadWebhookHandler } from '@/services/squadWebhookHandler'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const signature = req.headers.get('x-squad-signature') || ''
  const payload = await req.text()
  
  const result = await SquadWebhookHandler.processWebhook(payload, signature)
  
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

**Option B: Your Own Backend**

Create an endpoint like `POST /api/webhooks/squad` that processes Squad webhooks.

### Step 5: Update Database References

Update any database records or queries that reference `payment_gateway = 'paystack'` to use `'squad'` instead.

### Step 6: Test the Integration

1. **Test Payment Flow**:
   - Place a test order
   - Complete payment via Squad
   - Verify payment is recorded
   - Check webhook is received

2. **Test Webhook**:
   - Use Squad's webhook testing tool (if available)
   - Or trigger a test payment and verify webhook is processed

3. **Test Settlement**:
   - Complete an order delivery
   - Verify vendor and rider wallets are updated
   - Check settlement records are created

## 📝 Files That Need Updates

### Already Created:
- ✅ `src/config/squad.ts` - Squad configuration
- ✅ `src/services/squadPaymentService.ts` - Squad payment service
- ✅ `src/services/squadWebhookHandler.ts` - Squad webhook handler

### Need to Update:
- ⚠️ `src/services/paymentService.ts` - Update to use Squad
- ⚠️ `src/components/customer/PaymentModal.tsx` - Update payment UI
- ⚠️ `src/hooks/usePaystack.ts` - Replace with `useSquad.ts`
- ⚠️ `src/constants/paystack.ts` - Replace with `squad.ts`
- ⚠️ `src/utils/paystack.ts` - Replace with `squad.ts`
- ⚠️ `src/lib/paystack.ts` - Replace with `squad.ts`
- ⚠️ All components referencing Paystack

## 🔍 Squad API Documentation

Refer to Squad's official documentation:
- **API Docs**: [https://docs.squadco.com](https://docs.squadco.com)
- **Dashboard**: [https://dashboard.squadco.com](https://dashboard.squadco.com)

## ⚠️ Important Notes

1. **Amount Format**: Squad uses **kobo** (same as Paystack) - amounts are in the smallest currency unit
2. **Webhook Events**: Squad webhook events may differ from Paystack - verify event names in Squad docs
3. **API Differences**: Squad's API structure may differ from Paystack - adjust code accordingly
4. **Testing**: Always test in Squad's sandbox environment before going live

## 🚀 Next Steps

1. **Get Squad API Keys** from your Squad dashboard
2. **Update environment variables** with your Squad credentials
3. **Complete the file updates** listed above
4. **Create webhook endpoint** (Supabase Edge Function or your backend)
5. **Test thoroughly** in sandbox mode
6. **Deploy to production** when ready

## 📞 Support

- **Squad Support**: Check Squad's documentation or contact their support
- **Squad Dashboard**: [https://dashboard.squadco.com](https://dashboard.squadco.com)

---

**Note**: This migration guide assumes Squad's API is similar to Paystack. You may need to adjust based on Squad's actual API documentation.

