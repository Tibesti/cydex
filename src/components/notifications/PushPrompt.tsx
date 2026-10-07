import { useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { errorMessage } from '@/lib/address';
import { cn } from '@/lib/utils';
import { pushHelpText } from './NotificationSettingsCard';

// "Allow push notifications" when this device isn't receiving them yet.
// tone="warning" is the vendor banner (they shouldn't miss orders).
const PushPrompt = ({ tone = 'info', className }: { tone?: 'info' | 'warning'; className?: string }) => {
  const s = useNotificationSettings();
  const [busy, setBusy] = useState(false);
  if (s.loading || !s.deviceChecked || s.pushOnHere) return null;

  const canEnable = s.support === 'supported' && s.permission !== 'denied';
  const turnOn = async () => {
    setBusy(true);
    try {
      await s.setPush(true);
      toast.success("Push notifications are on for this device");
    } catch (e) {
      toast.error(errorMessage(e, 'Could not turn on push notifications'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center',
        tone === 'warning'
          ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50'
          : 'bg-muted/50',
        className,
      )}
    >
      <BellRing className="h-5 w-5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">
          {tone === 'warning' ? "Turn on push notifications so you don't miss customer orders" : 'Allow push notifications'}
        </p>
        <p className={tone === 'warning' ? 'opacity-90' : 'text-muted-foreground'}>{pushHelpText(s.support, s.permission)}</p>
      </div>
      {canEnable && (
        <Button size="sm" onClick={turnOn} disabled={busy} className="shrink-0">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Turn on
        </Button>
      )}
    </div>
  );
};

export default PushPrompt;
