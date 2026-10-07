import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallApp } from '@/hooks/useInstallApp';
import IosInstallSteps from './IosInstallSteps';

const SNOOZE_KEY = 'cydex:install-banner-dismissed-at';
const SNOOZE_DAYS = 14;

const snoozed = () => {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY));
    return !!at && Date.now() - at < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

// Bottom-of-screen invitation to install Cydex, on phones only. Closing it
// hides it for two weeks (the menu's "Install app" stays available).
const InstallBanner = () => {
  const { mode, install } = useInstallApp();
  const [hidden, setHidden] = useState(snoozed);
  const [isPhone, setIsPhone] = useState(() => window.matchMedia('(max-width: 768px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (!mode || hidden || !isPhone) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      // storage unavailable: just hide for now
    }
    setHidden(true);
  };

  return (
    <div
      role="dialog"
      aria-label="Install Cydex"
      className="fixed inset-x-2 bottom-2 z-50 rounded-xl border bg-card p-3 shadow-lg"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Install Cydex</p>
          {mode === 'prompt' ? (
            <p className="text-sm text-muted-foreground">Open it from your home screen and get order alerts.</p>
          ) : (
            <IosInstallSteps className="mt-1 space-y-1 text-sm text-muted-foreground" />
          )}
        </div>
        <button type="button" onClick={dismiss} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Not now">
          <X className="h-4 w-4" />
        </button>
      </div>
      {mode === 'prompt' && (
        <Button
          className="mt-3 w-full"
          onClick={async () => {
            const outcome = await install();
            if (outcome !== 'accepted') dismiss();
          }}
        >
          <Download className="mr-2 h-4 w-4" />
          Install
        </Button>
      )}
    </div>
  );
};

export default InstallBanner;
