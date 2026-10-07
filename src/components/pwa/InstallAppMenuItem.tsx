import { useState } from 'react';
import { Download } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInstallApp } from '@/hooks/useInstallApp';
import IosInstallSteps from './IosInstallSteps';

// "Install app" in the menus; on iPhone it explains the Share-menu steps
const InstallAppMenuItem = ({ className, onDone }: { className?: string; onDone?: () => void }) => {
  const { mode, install } = useInstallApp();
  const [iosHelp, setIosHelp] = useState(false);
  if (!mode) return null;

  return (
    <>
      <button
        type="button"
        className={className ?? 'flex w-full items-center rounded-md px-3 py-2 text-left text-foreground transition-colors hover:bg-muted'}
        onClick={async () => {
          if (mode === 'ios') setIosHelp(true);
          else {
            await install();
            onDone?.();
          }
        }}
      >
        <Download className="h-5 w-5" />
        <span className="ml-3">Install app</span>
      </button>
      <Dialog open={iosHelp} onOpenChange={setIosHelp}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Install Cydex</DialogTitle>
            <DialogDescription>Add Cydex to your Home Screen to open it like an app and get push notifications.</DialogDescription>
          </DialogHeader>
          <IosInstallSteps className="space-y-2 text-sm" />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InstallAppMenuItem;
