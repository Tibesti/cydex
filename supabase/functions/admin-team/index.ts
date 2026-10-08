// Admin invites, called by a signed-in admin from Admin → Users.
//   { action: 'invite', email, name } -> { member }
//     Sends Supabase's invite email. The link opens /auth/set-password, where
//     they choose a password and land in the admin dashboard.
//   { action: 'resend', profile_id } -> { member }
//     For someone who hasn't accepted yet: a fresh invite replaces the old one.
//   { action: 'remove', profile_id } -> { ok }
//     Takes away admin access (a pending invite is deleted outright). You can't
//     remove yourself or the last admin.
// Sign-up can never create an admin (handle_new_user forces customer), so the
// role is set here with the service key.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, corsHeaders, json } from '../_shared/squad.ts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Please sign in again' }, 401);

    const db = adminClient();
    const { data: me } = await db.from('profiles').select('role').eq('id', user.id).single();
    if (String(me?.role ?? '').toLowerCase() !== 'admin') return json({ error: 'Only admins can manage the team' }, 403);

    const body = await req.json().catch(() => ({}));
    const appUrl = (Deno.env.get('APP_URL') || req.headers.get('origin') || '').replace(/\/$/, '');
    const redirectTo = `${appUrl}/auth/set-password`;
    const audit = (action: string, targetId: string, values: Record<string, unknown>) =>
      db.from('audit_logs').insert({ admin_id: user.id, action, target_type: 'admin', target_id: targetId, new_values: values });

    const invite = async (email: string, name: string) => {
      const { data, error } = await db.auth.admin.inviteUserByEmail(email, { data: { name }, redirectTo });
      if (error || !data.user) throw new Error(error?.message || 'Could not send the invite');
      const id = data.user.id;
      await db.from('profiles').update({ role: 'admin', name }).eq('id', id);
      // The sign-up trigger treats them as a new customer: drop that welcome
      await db.from('email_outbox').delete().eq('profile_id', id).eq('status', 'pending');
      await db.from('notifications').delete().eq('user_id', id).eq('type', 'welcome');
      return { id, email, name };
    };

    const loadMember = async (id: string) => {
      const { data: p } = await db.from('profiles').select('id, name, email, role').eq('id', id).maybeSingle();
      if (!p || String(p.role).toLowerCase() !== 'admin') return null;
      const { data: u } = await db.auth.admin.getUserById(id);
      return { ...p, last_sign_in_at: u?.user?.last_sign_in_at ?? null };
    };

    if (body.action === 'invite') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const name = String(body.name ?? '').trim();
      if (!EMAIL.test(email)) return json({ error: 'Enter a valid email address' }, 400);
      if (name.length < 2) return json({ error: 'Enter their name' }, 400);
      const { data: existing } = await db.from('profiles').select('role').ilike('email', email).maybeSingle();
      if (existing) {
        return json({
          error: String(existing.role).toLowerCase() === 'admin'
            ? 'They’re already on the team'
            : 'This email already has a Cydex account. Invite a different email for their admin access.',
        }, 409);
      }
      const member = await invite(email, name);
      await audit('invite_admin', member.id, { email, name });
      return json({ member });
    }

    const targetId = String(body.profile_id ?? '');
    const target = await loadMember(targetId);
    if (!target) return json({ error: 'Team member not found' }, 404);

    if (body.action === 'resend') {
      if (target.last_sign_in_at) return json({ error: 'They’ve already joined' }, 409);
      await db.auth.admin.deleteUser(targetId);
      const member = await invite(String(target.email), String(target.name ?? ''));
      await audit('resend_admin_invite', member.id, { email: target.email });
      return json({ member });
    }

    if (body.action === 'remove') {
      if (targetId === user.id) return json({ error: 'You can’t remove yourself' }, 400);
      const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).ilike('role', 'admin');
      if ((count ?? 0) <= 1) return json({ error: 'Cydex needs at least one admin' }, 400);
      if (!target.last_sign_in_at) {
        // Never accepted: delete the invited account
        const { error } = await db.auth.admin.deleteUser(targetId);
        if (error) return json({ error: error.message }, 400);
      } else {
        // Keeps their login, as a customer, without admin access
        const { error } = await db.from('profiles').update({ role: 'customer' }).eq('id', targetId);
        if (error) return json({ error: error.message }, 400);
      }
      await audit('remove_admin', targetId, { email: target.email, had_joined: !!target.last_sign_in_at });
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : 'Team error' }, 500);
  }
});
