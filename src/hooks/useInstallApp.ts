import { useEffect, useState } from 'react';
import { canPromptInstall, isIos, isStandalone, onInstallChange, promptInstall } from '@/lib/pwa';

// Whether the app can be installed here, and how:
//  - "prompt": the browser can show its install dialog (Android, desktop Chrome/Edge)
//  - "ios": iPhone/iPad Safari, installed through Share → Add to Home Screen
//  - null: already installed, or this browser can't install apps
export const useInstallApp = () => {
  const [, rerender] = useState(0);
  useEffect(() => onInstallChange(() => rerender((n) => n + 1)), []);

  const installed = isStandalone();
  const mode: 'prompt' | 'ios' | null = installed ? null : canPromptInstall() ? 'prompt' : isIos() ? 'ios' : null;
  return { mode, installed, install: promptInstall };
};
