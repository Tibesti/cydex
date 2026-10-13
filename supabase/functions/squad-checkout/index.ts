// Customer payments through Squad, called from the app (signed-in customer).
//   { action: 'initiate', order_number }  -> { checkout_url }
//     Starts a Squad checkout for what the payer's wallet didn't cover.
//     order_number is an order's number (customer order, Cydex Express, or a
//     vendor's rider request) or a batch number (BAT-...: every unpaid stop
//     of a vendor's batch, in one payment).
//   { action: 'verify', transaction_ref }  -> { status }
//     Called when Squad redirects back; marks the order paid if Squad confirms it.
// The squad-webhook function does the same confirmation if the customer never returns.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  adminClient, confirmPayment, corsHeaders, json, newReference, orderNumberFromReference, squadApiUrl, squadSecret,
} from '../_shared/squad.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Please sign in again' }, 401);

    const body = await req.json().catch(() => ({}));
    const orderNumber: string | null = body.action === 'verify'
      ? orderNumberFromReference(String(body.transaction_ref ?? ''))
      : String(body.order_number ?? '') || null;
    if (!orderNumber) return json({ error: 'Order not found' }, 404);

    const db = adminClient();
    const { data: order } = await db
      .from('orders')
      .select('id, order_number, order_type, customer_id, vendor_id, status, payment_status, total_amount, wallet_amount')
      .eq('order_number', orderNumber)
      .maybeSingle();
    // A batch of rider requests is paid for together, against the batch number
    const { data: batch } = order ? { data: null } : await db
      .from('rider_request_batches').select('id, batch_number, vendor_id').eq('batch_number', orderNumber).maybeSingle();

    // The customer pays for their order or Cydex Express; the vendor for their rider requests
    const isRiderRequest = !!batch || order?.order_type === 'rider_request';
    const payer = batch ? batch.vendor_id : isRiderRequest ? order?.vendor_id : order?.customer_id;
    if ((!order && !batch) || payer !== user.id) return json({ error: 'Order not found' }, 404);

    if (body.action === 'verify') {
      const status = await confirmPayment(String(body.transaction_ref));
      return json({ status });
    }

    if (body.action !== 'initiate') return json({ error: 'Unknown action' }, 400);

    let amount: number;
    if (batch) {
      const { data: due } = await db.rpc('batch_amount_due', { p_batch_id: batch.id });
      amount = Number(due ?? 0);
      if (amount <= 0) return json({ error: 'This batch has already been paid' }, 409);
    } else {
      if (order!.payment_status !== 'pending' && order!.payment_status !== 'failed') {
        return json({ error: 'This order has already been paid' }, 409);
      }
      if (order!.status !== 'pending') return json({ error: 'This order can no longer be paid for' }, 409);
      amount = Number(order!.total_amount) - Number(order!.wallet_amount ?? 0);
    }
    const number = batch ? batch.batch_number : order!.order_number;

    // Squad sends the customer back here after paying
    const origin = req.headers.get('Origin') || Deno.env.get('APP_URL') || 'http://localhost:8080';
    const res = await fetch(`${squadApiUrl()}/transaction/initiate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${squadSecret()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // The card pays what the wallet didn't cover
        amount: Math.round(amount * 100),
        email: user.email,
        currency: 'NGN',
        initiate_type: 'inline',
        transaction_ref: newReference(number),
        callback_url: batch ? `${origin}/vendor/rider-requests?batch=${batch.id}`
          : isRiderRequest ? `${origin}/vendor/rider-requests/${order!.id}`
            : order!.order_type === 'express' ? `${origin}/customer/orders/${order!.id}`
              : `${origin}/customer/order-confirmation?order=${encodeURIComponent(order!.order_number)}`,
        customer_name: user.user_metadata?.name,
        payment_channels: ['card', 'bank', 'ussd', 'transfer'],
        metadata: { order_number: number, customer_id: user.id },
      }),
    });
    const squad = await res.json().catch(() => ({}));
    if (!res.ok || squad?.status !== 200 || !squad?.data?.checkout_url) {
      return json({ error: squad?.message || 'Could not start the payment' }, 502);
    }
    return json({ checkout_url: squad.data.checkout_url });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Payment error' }, 500);
  }
});
