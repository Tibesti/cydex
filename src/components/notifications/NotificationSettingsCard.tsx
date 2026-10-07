import { useState } from 'react';
import { BellRing, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { errorMessage } from '@/lib/address';

export const pushHelpText = (support: string, permission: string) =>
  support === 'ios-needs-install'
    ? 'On iPhone or iPad, add Cydex to your Home Screen (Share → Add to Home Screen), open it from there, then turn this on.'
    : support === 'unsupported'
      ? "This browser can't receive push notifications. Try Chrome, Edge or Firefox."
      : permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser settings, then turn this on.'
        : 'Get order updates on this device even when Cydex is closed.';

// Email and push notification switches (Settings → Preferences, all roles)
const NotificationSettingsCard = () => {
  const s = useNotificationSettings();
  const [busy, setBusy] = useState<'email' | 'push' | null>(null);

  const run = async (which: 'email' | 'push', fn: () => Promise<void>) => {
    setBusy(which);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not update your settings'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg">Notifications</CardTitle>
        <CardDescription>In-app notifications are always on. Choose how else we reach you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Email notifications</p>
              <p className="text-sm text-muted-foreground">Payment confirmations, refunds and account updates.</p>
            </div>
          </div>
          <Switch
            checked={s.emailEnabled}
            disabled={s.loading || busy === 'email'}
            onCheckedChange={(v) => run('email', () => s.setEmail(v))}
            aria-label="Email notifications"
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Push notifications on this device</p>
              <p className="text-sm text-muted-foreground">{pushHelpText(s.support, s.permission)}</p>
            </div>
          </div>
          <Switch
            checked={s.pushOnHere}
            disabled={s.loading || !s.deviceChecked || busy === 'push' || (s.support !== 'supported' && !s.pushOnHere)}
            onCheckedChange={(v) => run('push', () => s.setPush(v))}
            aria-label="Push notifications"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationSettingsCard;
