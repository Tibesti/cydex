// Installable app (PWA): registers the service worker and keeps the browser's
// "install" prompt so the app can offer its own Install button.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

export const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const canPromptInstall = () => !!deferredPrompt;

export const onInstallChange = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Shows the browser's install dialog (Android/desktop Chrome and Edge)
export const promptInstall = async () => {
  if (!deferredPrompt) return 'unavailable' as const;
  const event = deferredPrompt;
  deferredPrompt = null;
  emit();
  await event.prompt();
  return (await event.userChoice).outcome;
};

// Called once from main.tsx, before React renders
export const initPwa = () => {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own Install button instead of the mini-infobar
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered:', err));
    });
  }
};
