// Sends one notification as a browser push to the user's devices.
// Called by the database (push_new_notification trigger, via pg_net) with
// { notification_id }. It trusts nothing else in the request: it reads the
// notification itself, only sends to that user's own subscriptions, and only
// once (notifications.push_sent_at), so it needs no secret.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
import webpush from 'npm:web-push@3.6.7';
import { adminClient } from '../_shared/squad.ts';

const ORDER_LINKS: Record<string, (orderId: string, type: string) => string> = {
  customer: (id) => `/customer/orders/${id}`,
  vendor: (id) => `/vendor/orders/${id}`,
  rider: (id, type) => (type === 'order_nearby' ? '/rider/available' : `/rider/order/${id}`),
  admin: (id) => `/admin/orders/${id}`,
};
// Admin notifications that aren't about one order
const ADMIN_LINKS: Record<string, string> = {
  payout_request: '/admin/payments?tab=payouts',
  verification_request: '/admin/verifications',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return new Response('Push is not configured', { status: 500 });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:support@cydex.ng', publicKey, privateKey);

  const { notification_id } = await req.json().catch(() => ({}));
  if (!notification_id) return new Response('Missing notification_id', { status: 400 });

  const db = adminClient();
  const { data: n } = await db
    .from('notifications')
    .select('id, user_id, type, title, message, metadata, push_sent_at')
    .eq('id', notification_id)
    .maybeSingle();
  if (!n?.user_id || n.push_sent_at) return new Response(JSON.stringify({ skipped: true }), { status: 200 });

  // Claim it first so a repeated call can't send twice
  const { data: claimed } = await db
    .from('notifications')
    .update({ push_sent_at: new Date().toISOString() })
    .eq('id', n.id)
    .is('push_sent_at', null)
    .select('id');
  if (!claimed?.length) return new Response(JSON.stringify({ skipped: true }), { status: 200 });

  const [{ data: settings }, { data: subs }, { data: profile }] = await Promise.all([
    db.from('notification_settings').select('push_enabled').eq('profile_id', n.user_id).maybeSingle(),
    db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('profile_id', n.user_id),
    db.from('profiles').select('role').eq('id', n.user_id).maybeSingle(),
  ]);
  if (!settings?.push_enabled || !subs?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  const role = String(profile?.role ?? '').toLowerCase();
  const orderId = (n.metadata as { order_id?: string } | null)?.order_id;
  const url = orderId && ORDER_LINKS[role] ? ORDER_LINKS[role](orderId, n.type)
    : (role === 'admin' && ADMIN_LINKS[n.type]) || `/${role || 'customer'}/notifications`;
  const payload = JSON.stringify({ title: n.title, body: n.message, url, tag: n.id });

  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // The browser unsubscribed or the subscription expired
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('send-push', s.endpoint.slice(0, 40), status, (e as Error).message);
    }
  }));

  return new Response(JSON.stringify({ sent }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
