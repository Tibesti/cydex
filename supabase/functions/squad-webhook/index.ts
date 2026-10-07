// Squad payment webhook. Set this function's URL as the webhook in the Squad
// dashboard: https://<project-ref>.supabase.co/functions/v1/squad-webhook
// Deployed without JWT checks (see config.toml); requests are trusted only
// when the x-squad-encrypted-body header matches the HMAC-SHA512 of the body,
// and the payment is re-checked with Squad before the order is marked paid.
import { confirmPayment, squadSecret } from '../_shared/squad.ts';

async function hmacSha512Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface SquadEvent {
  Event?: string;
  TransactionRef?: string;
  Body?: { transaction_ref?: string };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await req.text();
  const signature = (req.headers.get('x-squad-encrypted-body') ?? '').toUpperCase();
  const expected = (await hmacSha512Hex(squadSecret(), raw)).toUpperCase();
  if (!signature || !sameText(signature, expected)) {
    return new Response('Invalid signature', { status: 401 });
  }

  let event: SquadEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const ref = event.TransactionRef ?? event.Body?.transaction_ref;
  if (event.Event !== 'charge_successful' || !ref) {
    return new Response(JSON.stringify({ ignored: true }), { status: 200 });
  }

  try {
    const status = await confirmPayment(ref);
    console.log('squad-webhook', ref, status);
    return new Response(JSON.stringify({ status }), { status: 200 });
  } catch (e) {
    // A non-200 makes Squad retry later
    console.error('squad-webhook', ref, e);
    return new Response('Could not confirm payment', { status: 500 });
  }
});
