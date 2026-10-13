import { useState } from 'react';
import { CheckCircle2, Download, Monitor, MoreVertical, PlusSquare, Share, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInstallApp } from '@/hooks/useInstallApp';
import { isIos } from '@/lib/pwa';

type Device = 'android' | 'iphone' | 'computer';

const detectDevice = (): Device => {
  if (isIos()) return 'iphone';
  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) return 'android';
  return 'computer';
};

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex items-start gap-3">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-black">{n}</span>
    <span className="min-w-0 pt-0.5">{children}</span>
  </li>
);

const B = ({ children }: { children: React.ReactNode }) => <span className="font-semibold">{children}</span>;

// How to put Cydex on a phone or computer. Cydex is an installable web app:
// there's nothing to get from an app store, the browser adds it to the home
// screen. Opens on the steps for the device being used, with a one-tap
// Install button where the browser allows it (Android, desktop Chrome/Edge).
const InstallInstructions = ({ className }: { className?: string }) => {
  const { mode, installed, install } = useInstallApp();
  const [device, setDevice] = useState<Device>(detectDevice);

  const installNow = async () => {
    const outcome = await install();
    if (outcome === 'accepted') toast.success('Cydex is being added to your device');
  };

  return (
    <div className={className}>
      {installed ? (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-primary/15 p-3 text-sm font-medium">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> Cydex is already installed on this device.
        </p>
      ) : mode === 'prompt' ? (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">Your browser can install Cydex right now, in one tap.</p>
          <Button onClick={installNow} className="shrink-0 text-black">
            <Download className="mr-2 h-4 w-4" /> Install Cydex
          </Button>
        </div>
      ) : null}

      <Tabs value={device} onValueChange={(v) => setDevice(v as Device)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="android" className="gap-1.5"><Smartphone className="h-4 w-4" /> Android</TabsTrigger>
          <TabsTrigger value="iphone" className="gap-1.5"><Smartphone className="h-4 w-4" /> iPhone</TabsTrigger>
          <TabsTrigger value="computer" className="gap-1.5"><Monitor className="h-4 w-4" /> Computer</TabsTrigger>
        </TabsList>

        <TabsContent value="android" className="mt-4">
          <ol className="space-y-3 text-sm">
            <Step n={1}>Open <B>usecydex.com</B> in <B>Chrome</B> (Edge and Samsung Internet work too).</Step>
            <Step n={2}>
              Tap <B>Install</B> on the banner at the bottom of the screen. No banner? Tap the menu{' '}
              <MoreVertical className="inline h-4 w-4" aria-label="three dots" /> at the top right.
            </Step>
            <Step n={3}>Choose <B>Install app</B> (or <B>Add to Home screen</B>), then tap <B>Install</B>.</Step>
            <Step n={4}>Open Cydex from your home screen and log in.</Step>
          </ol>
        </TabsContent>

        <TabsContent value="iphone" className="mt-4">
          <ol className="space-y-3 text-sm">
            <Step n={1}>Open <B>usecydex.com</B> in <B>Safari</B>. It has to be Safari; other browsers on iPhone can't install apps.</Step>
            <Step n={2}>Tap <Share className="inline h-4 w-4" aria-label="Share" /> <B>Share</B> in the toolbar at the bottom.</Step>
            <Step n={3}>Scroll down and choose <PlusSquare className="inline h-4 w-4" aria-hidden /> <B>Add to Home Screen</B>, then tap <B>Add</B>.</Step>
            <Step n={4}>Open Cydex from your Home Screen and log in. Allow notifications when asked, so you get order alerts.</Step>
          </ol>
        </TabsContent>

        <TabsContent value="computer" className="mt-4">
          <ol className="space-y-3 text-sm">
            <Step n={1}>Open <B>usecydex.com</B> in <B>Chrome</B> or <B>Edge</B>.</Step>
            <Step n={2}>
              Click the install icon <Download className="inline h-4 w-4" aria-label="install" /> at the right of the address bar
              (or the browser menu, then <B>Install Cydex</B>).
            </Step>
            <Step n={3}>Click <B>Install</B>. Cydex opens in its own window and is added to your apps.</Step>
          </ol>
        </TabsContent>
      </Tabs>

      <p className="mt-4 text-xs text-muted-foreground">
        Cydex installs straight from the browser, so there's nothing to download from an app store. It takes very little
        space and updates itself.
      </p>
    </div>
  );
};

export default InstallInstructions;
