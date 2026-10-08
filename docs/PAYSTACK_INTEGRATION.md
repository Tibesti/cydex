# Paystack Integration Guide

> **Status: legacy.** Customer checkout now runs on Squad: `src/components/customer/PaymentModal.tsx` calls `squadPaymentService`. No page or route imports the Paystack modules listed below, so they are not active. For the current gateway, see [SQUAD_MIGRATION_GUIDE.md](./SQUAD_MIGRATION_GUIDE.md). This guide stays here in case Paystack comes back or the leftover code needs cleaning up.

## Table of Contents
- [Overview](#overview)
- [Code Map](#code-map)
- [Configuration](#configuration)
- [Payment Flow](#payment-flow)
- [Webhook Setup](#webhook-setup)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)
- [Migration to Production](#migration-to-production)
- [Features and Roadmap](#features-and-roadmap)
- [Changelog](#changelog)
- [Support and Resources](#support-and-resources)

## Overview

Paystack processed payments for Cydex delivery orders. The integration supports test and production modes and includes error handling and client-side logging.

## Code Map

| File | Purpose |
| --- | --- |
| `src/config/paystack.ts` | Main config: keys, `IS_PRODUCTION`, currency, kobo helpers, reference generator, webhook secret |
| `src/lib/paystack.ts` | Payment config builder, transaction verification, currency formatting, validation, logging (built on `src/config/paystack.ts`) |
| `src/constants/paystack.ts` | A second copy of the keys and config, used by the webhook handler |
| `src/utils/paystack.ts` | A third copy of the config, always using the test public key, plus a popup config builder |
| `src/hooks/usePaystack.ts` | A React hook with its own copy of the keys; verifies transactions against the Paystack API |
| `src/services/webhookHandler.ts` | `PaystackWebhookHandler` for processing webhook events |

## Configuration

### Keys

The keys are **hardcoded** in `src/config/paystack.ts`. They aren't loaded from environment variables. The file has `TEST_PUBLIC_KEY`/`TEST_SECRET_KEY` and `PROD_PUBLIC_KEY`/`PROD_SECRET_KEY`. Right now the production keys are empty strings.

`getPublicKey()` and `getSecretKey()` choose a key using `IS_PRODUCTION`. That flag is set to `import.meta.env.PROD`, so **any production build (`vite build`) reads the empty production keys** until they are filled in.

The same test keys are also copied into `src/constants/paystack.ts`, `src/utils/paystack.ts`, and `src/hooks/usePaystack.ts`. If you change a key, update every copy, or better, merge them into a single config first.

### Environment Variables

The code reads only these:

```env
VITE_PAYSTACK_WEBHOOK_SECRET=your_webhook_secret   # src/config/paystack.ts
VITE_APP_URL=http://localhost:8080                 # callback URL base
```

Recommended setup when the keys move out of source code:

```env
VITE_PAYSTACK_PUBLIC_KEY=pk_live_your_live_public_key
PAYSTACK_SECRET_KEY=sk_live_your_live_secret_key   # backend only, never VITE_-prefixed
```

Vite includes every `VITE_`-prefixed variable in the client bundle, so a secret key must never carry that prefix.

## Payment Flow

1. **Order creation**: The customer creates an order, which gets status `pending`.
2. **Payment initiation**: The payment popup opens with the order details. The amount is converted to kobo, Paystack's smallest currency unit (`toKobo`).
3. **Paystack processing**: The customer enters payment details in the Paystack popup.
4. **Payment verification**: The transaction is verified against `https://api.paystack.co/transaction/verify/{reference}`. At present this runs client-side.
5. **Order update**: The order status changes according to the payment result.

### Usage Example

This is the Paystack-era `PaymentModal` usage. The current prop interface is the same, but the component now uses Squad underneath.

```tsx
<PaymentModal
  isOpen={isPaymentModalOpen}
  onClose={() => setIsPaymentModalOpen(false)}
  amount={orderTotal}
  orderNumber={orderNumber}
  customerEmail={userEmail}
  customerId={userId}
  onSuccess={(reference) => handlePaymentSuccess(reference)}
  onError={(error) => handlePaymentError(error)}
  metadata={{
    order_id: orderId,
    // Additional metadata as needed
  }}
/>
```

## Webhook Setup

In production, payment confirmation should come from a server-side webhook. The client-side callback alone is not enough.

1. In the Paystack Dashboard, go to **Settings > API Keys & Webhooks**.
2. Add your webhook URL (e.g. `https://yourdomain.com/api/webhooks/paystack`).
3. Set up a backend handler that checks the signature and processes events. `src/services/webhookHandler.ts` has the event-handling logic, but nothing mounts it on a server endpoint yet.

## Testing

### Test Cards

| Scenario | Card Number | Expiry | CVV |
| --- | --- | --- | --- |
| Successful payment | 4084 0840 8408 4081 | Any future date | 408 |
| Failed payment | 4084 0840 8408 4099 | Any future date | 408 |

When asked for an OTP, enter `123456`. The full list is in [Paystack's test payments docs](https://paystack.com/docs/payments/test-payments/).

### Manual Testing
1. Go to order checkout.
2. Click **Pay Now**.
3. Use the test card details above.
4. Check that success and failure are handled correctly.

### Test Scenarios
- Successful payment with a valid test card
- Failed payment with an invalid test card
- Payment cancelled by the user
- Network failure during payment
- Invalid payment amounts

### Test Webhooks
Paystack's test webhook tool can simulate events:
1. In the Paystack Dashboard, go to **Settings > Webhooks**.
2. Click **Send Test Webhook**.
3. Pick an event type and send it.

## Troubleshooting

### Payment modal not opening
- Check that the user is authenticated.
- Check that the order amount is valid (> 0).
- Look for JavaScript errors in the browser console.

### Payment fails
- Check that the public key is correct. In production builds, confirm the `PROD_*` keys are filled in.
- Check that the amount is in kobo and within a valid range.
- Check network connectivity.

### Order status not updating
- Check the payment success callback.
- Check the database connection and the order update logic.

### Webhook not received
- Check the server logs for incoming requests.
- Check that the webhook URL can be reached from the internet.
- Check that the webhook secret matches.

### Payment verification fails
- Check that the payment reference exists in Paystack.
- Check network connectivity.
- Check that the server time is synchronized.

### Debug information
Payment events are logged to the browser console with the payment reference, amount and currency, customer email, order number, and timestamp.

## Security Considerations

### Current implementation (known gaps)
- **The test secret key is hardcoded in several frontend files**, so it ships in the client bundle. `src/hooks/usePaystack.ts` sends it as a `Bearer` token from the browser.
- Payment verification happens client-side.
- Payment data is logged to the console for debugging.

### Before going live
- Move the secret key to a backend. Never ship it to the browser.
- Rotate the current test keys, because they are committed to version control.
- Verify payments server-side through webhooks and check webhook signatures.
- Validate all incoming data and add idempotency checks.
- Add fraud detection, retry logic, and monitoring for failed payments.
- Require HTTPS for all payment traffic.

### PCI compliance
- Never store full card details.
- Use Paystack's tokenization to store cards.
- Follow OWASP security guidelines.

## Migration to Production

1. **Obtain live keys**: In the Paystack Dashboard, go to **Settings > API Keys** and copy the live public and secret keys.
2. **Update configuration**: Put the live public key in the frontend config. Store the secret key on the backend only. Configure the production webhook URL.
3. **Security review**: Complete the checklist in [Before going live](#before-going-live).
4. **Testing**: Test with small live amounts, confirm webhooks arrive, and check the order fulfilment process.

## Features and Roadmap

### Implemented
- [x] Payment processing with Paystack
- [x] Test mode integration
- [x] Payment success/failure handling
- [x] Order metadata tracking
- [x] Client-side payment logging
- [x] Mobile-responsive payment modal
- [x] Currency formatting for Nigerian Naira
- [x] Payment amount validation

### Planned (never shipped)
- [ ] Webhook verification for backend payment confirmation
- [ ] Payment retry mechanism
- [ ] Refund processing
- [ ] Saved payment methods
- [ ] Subscription payments for premium features
- [ ] Multi-currency support
- [ ] Payment analytics dashboard

## Changelog

### v1.0.0
- Initial Paystack integration
- Test mode implementation
- Basic payment flow
- Payment modal UI
- Order integration

### Later
- Checkout replaced by Squad (see [SQUAD_MIGRATION_GUIDE.md](./SQUAD_MIGRATION_GUIDE.md))

## Support and Resources

- [Paystack Documentation](https://paystack.com/docs/)
- [React Paystack Library](https://github.com/iamraphson/react-paystack)
- [Paystack Test Cards](https://paystack.com/docs/payments/test-payments/)
- Paystack Support: support@paystack.com
- Cydex Development Team: dev@cydex.com
