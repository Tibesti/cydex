// Sends the emails the database queues in email_outbox (welcome, payment
// confirmed, refund, verification, delivery codes for recipients). Meant to
// run every minute from pg_cron.
// Secrets:
//   BREVO_API_KEY      from brevo.com (SMTP & API -> API Keys). Used when set;
//   RESEND_API_KEY     otherwise Resend is used, if this is set instead
//   EMAIL_FROM         e.g. "Cydex <hello@usecydex.com>" (a sender on a verified domain)
//   EMAIL_CRON_SECRET  any long random string; callers send it as x-cron-secret
import { adminClient } from '../_shared/squad.ts';

const MAX_ATTEMPTS = 5;

const naira = (n: unknown) =>
  `₦${Number(n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const escape = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const SITE = 'https://usecydex.com';
// Where "open the app" buttons go (the marketing site until APP_URL is the live app)
const appUrl = () => {
  const url = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
  return url && !/localhost|127\.0\.0\.1/.test(url) ? url : SITE;
};

interface Email {
  heading: string;
  /** Short line some inboxes show next to the subject */
  preview: string;
  /** Paragraphs (already escaped HTML) */
  paragraphs: string[];
  /** A highlighted box: a code, an amount or a reason */
  highlight?: { label: string; value: string; large?: boolean };
  after?: string[];
  button?: { label: string; url: string };
  /** Why they got it (small print under the email); defaults to "activity on Cydex" */
  footer?: string;
}

const b = (s: unknown) => `<strong>${escape(s)}</strong>`;

function email(template: string, d: Record<string, unknown>): Email {
  const app = appUrl();
  const role = String(d.role ?? '');
  switch (template) {
    case 'welcome':
      return {
        heading: 'Welcome to Cydex',
        preview: 'Your account is ready.',
        paragraphs: [
          role === 'vendor' ? 'Your store account is ready. Finish setting up your store, add your products and start receiving orders from customers near you.'
            : role === 'rider' ? 'Your rider account is ready. Finish your verification, then keep your location on in the app to see deliveries near you.'
              : 'Your account is ready. Add your delivery address and order from vendors near you, delivered by bike, on foot or e-bike.',
        ],
        button: { label: 'Open Cydex', url: app },
      };
    case 'payment_confirmed':
      return {
        heading: 'Payment confirmed',
        preview: `We've received your payment for order #${d.order_number}.`,
        paragraphs: [`We've received your payment for order ${b('#' + d.order_number)}.`],
        highlight: { label: 'Amount paid', value: naira(d.total_amount) },
        after: ['The vendor will accept it shortly, and you can follow it in the app.'],
        button: { label: 'Track your order', url: `${app}/customer/orders` },
      };
    case 'refund':
      return {
        heading: 'Refund issued',
        preview: `${naira(d.amount)} is back in your Cydex wallet.`,
        paragraphs: [`Your refund for ${b('#' + d.order_number)} has been added to your Cydex wallet.`],
        highlight: { label: 'Refunded', value: naira(d.amount) },
        after: ['You can use it on your next order, or withdraw it.'],
        button: { label: 'View your wallet', url: `${app}/customer/wallet` },
      };
    case 'verification_submitted':
      return {
        heading: "We've received your details",
        preview: 'Our team is reviewing them.',
        paragraphs: [
          role === 'vendor'
            ? "Thanks for submitting your store details. Our team is reviewing your business licence, and we'll email you as soon as it's done."
            : "Thanks for submitting your rider details. Our team is reviewing them, and we'll email you as soon as you can start delivering.",
        ],
      };
    case 'verification_approved':
      return {
        heading: "You're verified",
        preview: role === 'vendor' ? 'Customers now see your verified badge.' : 'You can now accept deliveries.',
        paragraphs: [
          role === 'vendor'
            ? 'Good news: your store has been verified. Customers now see your verified badge.'
            : 'Good news: your rider account has been verified. You can now go online and accept deliveries.',
        ],
        button: { label: 'Go to your dashboard', url: `${app}/${role === 'vendor' ? 'vendor' : 'rider'}` },
      };
    case 'verification_rejected':
      return {
        heading: "Your verification wasn't approved",
        preview: 'You can update your details and submit again.',
        paragraphs: ["We couldn't approve your verification this time."],
        highlight: { label: 'Reason', value: String(d.reason ?? 'Not given') },
        after: ['Update your details and submit them again, and we will take another look.'],
        button: { label: 'Update your details', url: `${app}/${role === 'vendor' ? 'vendor' : 'rider'}/onboarding` },
      };
    case 'account_suspended':
      return {
        heading: 'Your account has been suspended',
        preview: 'Reply to this email if you think this is a mistake.',
        paragraphs: ['Your Cydex account has been suspended.'],
        highlight: { label: 'Reason', value: String(d.reason ?? 'Not given') },
        after: ['If you think this is a mistake, reply to this email and our team will look into it.'],
      };
    case 'account_reinstated':
      return {
        heading: 'Your account is active again',
        preview: 'Welcome back.',
        paragraphs: ['Your Cydex account has been reinstated. You can log in and carry on as before.'],
        button: { label: 'Open Cydex', url: app },
      };
    case 'delivery_code':
      // To someone receiving a delivery, who may not have a Cydex account
      return {
        heading: 'A delivery is on its way to you',
        preview: `${d.sender_name} is sending you a delivery. Your delivery code is inside.`,
        paragraphs: [
          `${b(d.sender_name)} is sending you a delivery with Cydex${d.package ? ` (${escape(d.package)})` : ''}${
            d.address ? `, to ${escape(d.address)}` : ''
          }.`,
          'When the rider arrives, give them this delivery code:',
        ],
        highlight: { label: 'Your delivery code', value: String(d.code ?? ''), large: true },
        after: [
          `Only share it once you have your delivery in hand. Reference: #${escape(d.order_number)}.`,
          'Cydex delivers from vendors near you by bike, on foot and e-bike, and you can send items across town with Cydex Express.',
        ],
        button: { label: 'Try Cydex', url: SITE },
      };
    case 'announcement': {
      // A broadcast written by an admin (Admin -> Broadcasts). A blank line in
      // the message starts a new paragraph; single line breaks are kept.
      const body = String(d.body ?? '').replace(/\r\n/g, '\n').trim();
      return {
        heading: String(d.title ?? 'News from Cydex'),
        preview: body.replace(/\s+/g, ' ').slice(0, 140),
        paragraphs: body.split(/\n\s*\n/).map((para) => escape(para.trim()).replace(/\n/g, '<br>')).filter(Boolean),
        button: { label: 'Open Cydex', url: app },
        footer: "You're getting this email because you have a Cydex account. To stop emails like this, turn off email notifications in your Cydex settings.",
      };
    }
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

// One layout for every email: green Cydex header, heading, text, optional
// highlighted box and button, footer. Tables and inline styles, because email
// apps ignore most modern CSS.
function render(template: string, d: Record<string, unknown>): string {
  const e = email(template, d);
  const p = (text: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1F2A1C;">${text}</p>`;
  const highlight = e.highlight
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
         <tr><td style="background:#F1FBE6;border:1px solid #CDEFA3;border-radius:10px;padding:16px 20px;${e.highlight.large ? 'text-align:center;' : ''}">
           <div style="font-size:12px;line-height:16px;color:#4B5B45;text-transform:uppercase;letter-spacing:1px;">${escape(e.highlight.label)}</div>
           <div style="margin-top:6px;font-weight:bold;color:#0F1A0C;${
             e.highlight.large ? 'font-size:34px;line-height:40px;letter-spacing:8px;font-family:Courier New,Courier,monospace;' : 'font-size:18px;line-height:26px;'
           }">${escape(e.highlight.value)}</div>
         </td></tr>
       </table>`
    : '';
  const button = e.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;">
         <tr><td style="background:#6CE000;border-radius:8px;">
           <a href="${escape(e.button.url)}" style="display:inline-block;padding:13px 26px;font-size:16px;font-weight:bold;color:#0F1A0C;text-decoration:none;">${escape(e.button.label)}</a>
         </td></tr>
       </table>`
    : '';

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(e.heading)}</title></head>
<body style="margin:0;padding:0;background:#F3F5EF;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(e.preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5EF;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="background:#6CE000;border-radius:14px 14px 0 0;padding:22px 28px;">
          <span style="font-size:26px;line-height:30px;font-weight:bold;color:#0F1A0C;letter-spacing:-0.5px;">Cydex</span>
          <span style="font-size:13px;line-height:30px;color:#1F3A12;padding-left:10px;">Eco-friendly delivery</span>
        </td></tr>
        <tr><td style="background:#FFFFFF;padding:28px 28px 20px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#0F1A0C;">${escape(e.heading)}</h1>
          ${p(`Hi ${escape(d.name) || 'there'},`)}
          ${e.paragraphs.map(p).join('')}
          ${highlight}
          ${(e.after ?? []).map(p).join('')}
          ${button}
        </td></tr>
        <tr><td style="background:#FFFFFF;border-top:1px solid #E6EADF;border-radius:0 0 14px 14px;padding:18px 28px 22px;">
          <p style="margin:0 0 6px;font-size:14px;line-height:20px;color:#4B5B45;">The Cydex team</p>
          <p style="margin:0;font-size:13px;line-height:19px;color:#7A8774;">
            <a href="${SITE}" style="color:#3F8500;text-decoration:none;font-weight:bold;">usecydex.com</a>
            &nbsp;·&nbsp; Delivery by bike, on foot and e-bike
          </p>
        </td></tr>
        <tr><td style="padding:14px 28px;text-align:center;font-size:12px;line-height:18px;color:#8A9584;">
          ${escape(e.footer ?? "You're getting this email because of activity on Cydex involving this address.")}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// "Cydex <hello@usecydex.com>" -> { name: 'Cydex', email: 'hello@usecydex.com' }
const parseFrom = (from: string) => {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || 'Cydex', email: m[2] } : { name: 'Cydex', email: from.trim() };
};

async function send(to: string, subject: string, html: string, from: string) {
  const brevo = Deno.env.get('BREVO_API_KEY');
  if (brevo) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevo, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: parseFrom(from), to: [{ email: to }], subject, htmlContent: html }),
    });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('EMAIL_CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }
  const from = Deno.env.get('EMAIL_FROM');
  if (!from || !(Deno.env.get('BREVO_API_KEY') || Deno.env.get('RESEND_API_KEY'))) {
    return new Response('Email is not configured', { status: 500 });
  }

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
  for (const row of emails ?? []) {
    try {
      await send(row.to_email, row.subject, render(row.template, row.data ?? {}), from);
      await db.from('email_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1 })
        .eq('id', row.id);
      sent++;
    } catch (e) {
      const attempts = row.attempts + 1;
      await db.from('email_outbox').update({
        attempts,
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        last_error: e instanceof Error ? e.message : String(e),
      }).eq('id', row.id);
    }
  }
  return new Response(JSON.stringify({ sent, pending: (emails?.length ?? 0) - sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
