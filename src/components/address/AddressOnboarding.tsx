import { useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useAddresses } from '@/hooks/useAddresses';
import { AddressPickerDialog } from './AddressPickerDialog';

const COPY = {
  CUSTOMER: {
    title: 'Where should we deliver?',
    description:
      'Choose your delivery address. It becomes your default, and you can add more under Profile → Saved addresses.',
    fixedLabel: undefined,
  },
  VENDOR: {
    title: 'Where is your store?',
    description:
      'Set your store location so riders know where to pick up orders. You can change it later in Settings → Account.',
    fixedLabel: 'Store',
  },
};

const dismissedKey = (userId: string) => `address_onboarding_dismissed_${userId}`;

const wasDismissed = (userId: string) => {
  try {
    return sessionStorage.getItem(dismissedKey(userId)) === '1';
  } catch {
    return false;
  }
};

// Shown after login to customers with no saved address and vendors with no
// store location. "Not now" hides it until their next session.
const AddressOnboarding = ({ role }: { role: keyof typeof COPY }) => {
  const { user } = useAuth();
  const { addresses, hasLoaded } = useAddresses();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  if (!user?.id) return null;
  const dismissed = dismissedFor === user.id || wasDismissed(user.id);
  const copy = COPY[role];

  const dismiss = () => {
    setDismissedFor(user.id);
    try {
      sessionStorage.setItem(dismissedKey(user.id), '1');
    } catch {
      // Storage unavailable: it just won't be remembered across page loads
    }
  };

  return (
    <AddressPickerDialog
      open={hasLoaded && addresses.length === 0 && !dismissed}
      onOpenChange={(open) => !open && dismiss()}
      title={copy.title}
      description={copy.description}
      fixedLabel={copy.fixedLabel}
      dismissLabel="Not now"
    />
  );
};

export default AddressOnboarding;
