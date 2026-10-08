import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import AuthLayout from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';

// Where the links in password-reset and admin-invite emails land. The link
// signs them in; here they choose a password and go to their dashboard.
const SetPassword = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState<'checking' | 'yes' | 'no'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const invited = typeof window !== 'undefined' && window.location.hash.includes('type=invite');

  useEffect(() => {
    let done = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !done) { done = true; setReady('yes'); }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { done = true; setReady('yes'); }
    });
    // The link is read from the URL right away; give it a moment
    const t = setTimeout(() => { if (!done) setReady('no'); }, 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
      const role = String(profile?.role ?? 'customer').toLowerCase();
      toast.success(invited ? 'Welcome to the Cydex team' : 'Password updated');
      // Full load so the app picks up the signed-in profile
      window.location.replace(`/${role}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save your password'));
      setSaving(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{invited ? 'Join the Cydex team' : 'Choose a new password'}</h1>
        <p className="mt-2 text-muted-foreground">
          {invited ? 'Set a password for your admin account.' : 'Enter a new password for your account.'}
        </p>
      </div>

      {ready === 'checking' && (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {ready === 'no' && (
        <div className="space-y-4 text-center">
          <p className="text-muted-foreground">
            This link has expired or was already used. {invited ? 'Ask an admin to resend your invite.' : 'Request a new one.'}
          </p>
          <div className="flex justify-center gap-2">
            {!invited && <Button asChild><Link to="/auth/reset-password">Send a new link</Link></Button>}
            <Button variant="outline" onClick={() => navigate('/auth')}>Back to login</Button>
          </div>
        </div>
      )}

      {ready === 'yes' && (
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
            {tooShort && <p className="text-xs text-destructive">Use at least 8 characters.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} required />
            {mismatch && <p className="text-xs text-destructive">The passwords don't match.</p>}
          </div>
          <Button type="submit" className="w-full" disabled={saving || password.length < 8 || confirm !== password}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
};

export default SetPassword;
