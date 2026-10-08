// Squad helpers shared by the squad-checkout and squad-webhook functions.
// Secrets (set with `npx supabase secrets set`):
//   SQUAD_SECRET_KEY  sandbox_sk_... or sk_...
//   SQUAD_API_URL     https://sandbox-api-d.squadco.com (default) or https://api-d.squadco.com
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const squadApiUrl = () => Deno.env.get('SQUAD_API_URL') || 'https://sandbox-api-d.squadco.com';

export function squadSecret(): string {
  const key = Deno.env.get('SQUAD_SECRET_KEY');
  if (!key) throw new Error('SQUAD_SECRET_KEY is not set');
  return key;
}

export const adminClient = (): SupabaseClient =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

// References look like CYDEX-<order number>-<timestamp>-<random>
export const newReference = (orderNumber: string) =>
  `CYDEX-${orderNumber}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`.toUpperCase();

export function orderNumberFromReference(ref: string): string | null {
  const parts = ref.toUpperCase().split('-');
  if (parts[0] !== 'CYDEX' || parts.length < 4) return null;
  return parts.slice(1, -2).join('-');
}

export type ConfirmResult = 'paid' | 'already_paid' | 'refunded' | 'amount_mismatch' | 'not_found' | 'not_successful';

// Asks Squad for the transaction's real status and amount, then records it.
// Safe to call more than once for the same payment (redirect + webhook).
export async function confirmPayment(ref: string): Promise<ConfirmResult> {
  const orderNumber = orderNumberFromReference(ref);
  if (!orderNumber) return 'not_found';

  const res = await fetch(`${squadApiUrl()}/transaction/verify/${encodeURIComponent(ref)}`, {
    headers: { Authorization: `Bearer ${squadSecret()}` },
  });
  const body = await res.json().catch(() => ({}));
  const tx = body?.data;
  if (!res.ok || body?.status !== 200 || !tx) {
    throw new Error(body?.message || `Squad verify failed (${res.status})`);
  }
  // Squad's docs say "Success" but the API returns "success": compare without case
  const status = String(tx.transaction_status ?? '').toLowerCase();
  const currency = String(tx.transaction_currency_id ?? 'NGN').toUpperCase();
  if (status !== 'success' || currency !== 'NGN') {
    return 'not_successful';
  }

  const { data, error } = await adminClient().rpc('confirm_order_payment', {
    p_order_number: orderNumber,
    p_reference: ref,
    p_amount: Number(tx.transaction_amount) / 100,
    p_details: {
      gateway: 'squad',
      transaction_ref: tx.transaction_ref,
      transaction_type: tx.transaction_type,
      email: tx.email,
      created_at: tx.created_at,
    },
  });
  if (error) throw error;
  return data as ConfirmResult;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
