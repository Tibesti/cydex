import { useState } from 'react';
import { Bell, Download, Smartphone, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DownloadAppDialog from '@/components/pwa/DownloadAppDialog';
import InstallInstructions from '@/components/pwa/InstallInstructions';

const PERKS = [
  { icon: Smartphone, title: 'On your home screen', text: 'Opens full screen like any app, with its own icon.' },
  { icon: Bell, title: 'Order alerts', text: 'Get notified the moment your order moves, even with Cydex closed.' },
  { icon: Zap, title: 'Nothing to download', text: 'Installs from your browser in seconds and updates itself.' },
];

// Landing page: "Get the Cydex app" with the install steps for each device
const DownloadAppSection = () => {
  const [open, setOpen] = useState(false);

  return (
    <section id="download" className="bg-muted/40 py-12 md:py-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-5">
            <h2 className="text-2xl font-bold md:text-4xl">
              Get the <span className="text-primary">Cydex app</span>
            </h2>
            <p className="text-sm text-muted-foreground md:text-base">
              Add Cydex to your phone and order, sell or deliver from your home screen. It works on Android, iPhone and
              computers.
            </p>
            <ul className="space-y-4">
              {PERKS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-sm text-muted-foreground">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
            {/* On phones the steps are a tap away; larger screens show them alongside */}
            <Button size="lg" className="w-full text-black sm:w-auto lg:hidden" onClick={() => setOpen(true)}>
              <Download className="mr-2 h-5 w-5" /> Download the app
            </Button>
          </div>

          <div className="hidden rounded-2xl border bg-card p-5 shadow-sm lg:block">
            <h3 className="mb-4 text-lg font-semibold">How to install</h3>
            <InstallInstructions />
          </div>
        </div>
      </div>
      <DownloadAppDialog open={open} onOpenChange={setOpen} />
    </section>
  );
};

export default DownloadAppSection;
