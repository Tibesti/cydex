// Wallet withdrawals through Squad transfers. Every withdrawal waits for an admin.
//   Vendor, rider or customer:
//     { action: 'request', amount, bank_account_id } -> { payout }
//       The database deducts the balance and records a 'pending' request
//       (request_payout). Nothing is sent yet.
//     { action: 'requery', payout_id } -> { payout }
//   Admin:
//     { action: 'approve', role, payout_id } -> { payout }
//       Sends the transfer. If Squad rejects it, the money goes back (settle_payout).
//     { action: 'requery', role, payout_id } -> { payout }
//       Asks Squad for the transfer's status and records it.
//   Rejecting is done in the database (admin_reject_payout).
// Secrets: SQUAD_SECRET_KEY, SQUAD_API_URL, SQUAD_MERCHANT_ID (reference prefix, default CYDEX)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, corsHeaders, json, squadApiUrl, squadSecret } from '../_shared/squad.ts';

type Role = 'vendor' | 'rider' | 'customer';

const TABLES: Record<Role, { payouts: string; banks: string; owner: string }> = {
  vendor: { payouts: 'vendor_payout_requests', banks: 'vendor_bank_accounts', owner: 'vendor_id' },
  rider: { payouts: 'rider_payout_requests', banks: 'rider_bank_details', owner: 'rider_id' },
  customer: { payouts: 'customer_withdrawal_requests', banks: 'customer_bank_accounts', owner: 'customer_id' },
};

async function squad(path: string, body: unknown) {
  const res = await fetch(`${squadApiUrl()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${squadSecret()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data?.status === 200, data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Please sign in again' }, 401);

    const db = adminClient();
    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
    const myRole = String(profile?.role ?? '').toLowerCase();
    const isAdmin = myRole === 'admin';
    const body = await req.json().catch(() => ({}));

    // Admins act on anyone's withdrawal (role given); everyone else on their own
    const role = (isAdmin ? String(body.role ?? '') : myRole) as Role;
    if (!TABLES[role]) {
      return json({ error: isAdmin ? 'Unknown withdrawal type' : 'Withdrawals aren’t available for this account' }, isAdmin ? 400 : 403);
    }
    const t = TABLES[role];

    const settle = (id: string, status: string, extra: { reference?: string; metadata?: unknown; reason?: string } = {}) =>
      db.rpc('settle_payout', {
        p_role: role, p_id: id, p_status: status,
        p_reference: extra.reference ?? null, p_metadata: extra.metadata ?? null, p_reason: extra.reason ?? null,
      });
    const load = async (id: string) => {
      let q = db.from(t.payouts).select('*').eq('id', id);
      if (!isAdmin) q = q.eq(t.owner, user.id);
      return (await q.maybeSingle()).data;
    };
    const audit = (action: string, id: string, values: Record<string, unknown>) =>
      db.from('audit_logs').insert({ admin_id: user.id, action, target_type: `${role}_payout`, target_id: id, new_values: values });

    if (body.action === 'request') {
      if (isAdmin) return json({ error: 'Admins can’t withdraw' }, 403);
      // Balance check + deduction happen in the database, as the user
      const { data: payoutId, error } = await userClient.rpc('request_payout', {
        p_amount: Number(body.amount), p_bank_account_id: String(body.bank_account_id ?? ''),
      });
      if (error) return json({ error: error.message }, 400);
      return json({ payout: await load(payoutId) });
    }

    if (body.action === 'approve') {
      if (!isAdmin) return json({ error: 'Only admins can approve withdrawals' }, 403);
      const id = String(body.payout_id ?? '');
      // Claim it, so two admins can't both send it
      const { data: claimed } = await db.from(t.payouts)
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'pending').select('*').maybeSingle();
      if (!claimed) return json({ error: 'This withdrawal is no longer waiting for approval' }, 409);

      const { data: bank } = await db.from(t.banks).select('*').eq('id', claimed.bank_account_id).maybeSingle();
      const merchant = Deno.env.get('SQUAD_MERCHANT_ID') || 'CYDEX';
      // Derived from the request id, so a retry can't send a second transfer
      const reference = `${merchant}_${id.replace(/-/g, '')}`;
      if (!bank?.bank_code || !bank?.account_number) {
        await settle(id, 'failed', { reference, reason: 'Bank account is missing or incomplete' });
        await audit('approve_payout', id, { result: 'failed', reason: 'Bank account is missing or incomplete' });
        return json({ error: 'The bank account is missing or incomplete. The money was returned to their wallet.' }, 400);
      }

      let accountName = bank.account_name;
      const lookup = await squad('/payout/account/lookup', { bank_code: bank.bank_code, account_number: bank.account_number });
      if (lookup.ok && lookup.data?.data?.account_name) accountName = lookup.data.data.account_name;

      const transfer = await squad('/payout/transfer', {
        transaction_reference: reference,
        amount: String(Math.round(Number(claimed.net_amount) * 100)),
        bank_code: bank.bank_code,
        account_number: bank.account_number,
        account_name: accountName,
        currency_id: 'NGN',
        remark: `Cydex ${role} withdrawal`,
      });

      if (!transfer.ok) {
        const reason = transfer.data?.message || 'Transfer was rejected';
        await settle(id, 'failed', { reference, metadata: transfer.data, reason });
        await audit('approve_payout', id, { result: 'failed', reason, amount: claimed.amount });
        return json({ error: `${reason}. The money was returned to their wallet.` }, 502);
      }
      await settle(id, 'processing', { reference, metadata: transfer.data?.data ?? {} });
      await audit('approve_payout', id, { result: 'sent', amount: claimed.amount, reference });
      return json({ payout: await load(id) });
    }

    if (body.action === 'requery') {
      const payout = await load(String(body.payout_id ?? ''));
      if (!payout) return json({ error: 'Payout not found' }, 404);
      if (!payout.transfer_reference || payout.status !== 'processing') return json({ payout });

      const result = await squad('/payout/requery', { transaction_reference: payout.transfer_reference });
      const status = String(result.data?.data?.transaction_status ?? result.data?.data?.status ?? '').toLowerCase();
      const next = ['success', 'successful', 'completed'].includes(status) ? 'completed'
        : ['failed', 'reversed'].includes(status) ? 'failed'
          : null;
      if (next) {
        await settle(payout.id, next, { metadata: result.data?.data, reason: next === 'failed' ? `Transfer ${status}` : undefined });
      }
      return json({ payout: await load(payout.id) });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Withdrawal error' }, 500);
  }
});
