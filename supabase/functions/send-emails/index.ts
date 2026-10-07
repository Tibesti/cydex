// Sends the emails the database queues in email_outbox (welcome, payment
// confirmed, refund). Meant to run every minute from pg_cron.
// Secrets:
//   RESEND_API_KEY     from resend.com
//   EMAIL_FROM         e.g. "Cydex <hello@cydex.ng>" (a domain verified in Resend)
//   EMAIL_CRON_SECRET  any long random string; callers send it as x-cron-secret
import { adminClient } from '../_shared/squad.ts';

const MAX_ATTEMPTS = 5;

const naira = (n: unknown) =>
  `₦${Number(n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const escape = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function body(template: string, d: Record<string, unknown>): string {
  const hi = `<p>Hi ${escape(d.name) || 'there'},</p>`;
  switch (template) {
    case 'welcome':
      return `${hi}<p>Welcome to Cydex! ${
        d.role === 'vendor' ? 'Add your store location and products to start receiving orders.'
          : d.role === 'rider' ? 'Keep your location on in the app to see orders near you.'
            : 'Add your delivery address and order from vendors near you.'
      }</p>`;
    case 'payment_confirmed':
      return `${hi}<p>We've received your payment of <strong>${naira(d.total_amount)}</strong> for order
        <strong>#${escape(d.order_number)}</strong>. The vendor will accept it shortly, and you'll get updates in the app.</p>`;
    case 'refund':
      return `${hi}<p><strong>${naira(d.amount)}</strong> for order <strong>#${escape(d.order_number)}</strong>
        has been refunded to your Cydex wallet.</p>`;
    case 'verification_approved':
      return `${hi}<p>Good news: your ${d.role === 'vendor' ? 'store' : 'rider account'} has been verified.
        ${d.role === 'vendor' ? 'Customers now see your verified badge.' : 'You can now accept deliveries in the app.'}</p>`;
    case 'verification_rejected':
      return `${hi}<p>Your verification wasn't approved.</p><p><strong>Reason:</strong> ${escape(d.reason)}</p>
        <p>Log in to update your details and resubmit.</p>`;
    case 'account_suspended':
      return `${hi}<p>Your Cydex account has been suspended.</p><p><strong>Reason:</strong> ${escape(d.reason)}</p>
        <p>Reply to this email if you think this is a mistake.</p>`;
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

const wrap = (content: string) =>
  `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:520px">${content}
   <p style="color:#666;font-size:13px">— The Cydex team</p></div>`;

Deno.serve(async (req) => {
  const secret = Deno.env.get('EMAIL_CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!apiKey || !from) return new Response('Email is not configured', { status: 500 });

  const db = adminClient();
  const { data: emails, error } = await db
    .from('email_outbox')
    .select('*')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at')
    .limit(25);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const email of emails ?? []) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: email.to_email,
          subject: email.subject,
          html: wrap(body(email.template, email.data ?? {})),
        }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      await db.from('email_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: email.attempts + 1 })
        .eq('id', email.id);
      sent++;
    } catch (e) {
      const attempts = email.attempts + 1;
      await db.from('email_outbox').update({
        attempts,
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        last_error: e instanceof Error ? e.message : String(e),
      }).eq('id', email.id);
    }
  }
  return new Response(JSON.stringify({ sent, pending: (emails?.length ?? 0) - sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
