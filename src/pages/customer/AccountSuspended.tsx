import { Ban } from 'lucide-react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Shown instead of the customer app while an admin has the account suspended
const AccountSuspended = ({ reason, onCheckAgain }: { reason: string | null; onCheckAgain: () => void }) => (
  <OnboardingLayout>
    <Card className="mt-6 flex flex-col items-center gap-4 p-8 text-center">
      <Ban className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-2xl font-bold">Account suspended</h1>
      <p className="max-w-md text-muted-foreground">
        You can't place orders right now. Reason: {reason ?? 'not given'}. Contact Cydex support if you think this is a mistake.
      </p>
      <Button variant="outline" onClick={onCheckAgain}>Check again</Button>
    </Card>
  </OnboardingLayout>
);

export default AccountSuspended;
