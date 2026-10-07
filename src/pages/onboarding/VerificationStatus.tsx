import { Navigate, useNavigate } from 'react-router-dom';
import { Ban, Clock, MailCheck, ShieldX } from 'lucide-react';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import LoadingDisplay from '@/components/ui/LoadingDisplay';
import { useMyVerification } from '@/hooks/useMyVerification';
import { accessFor } from '@/lib/verification';

// Where vendors and riders land when they can't use the dashboard yet:
// waiting for review, rejected (edit and resubmit) or suspended.
const VerificationStatus = ({ role }: { role: 'vendor' | 'rider' }) => {
  const navigate = useNavigate();
  const { verification, loading, refetch } = useMyVerification();

  if (loading) return <LoadingDisplay fullScreen message="Loading..." size="md" />;
  const access = accessFor(role, verification);
  if (access === 'onboarding') return <Navigate to={`/${role}/onboarding`} replace />;
  if (access === 'ok') return <Navigate to={`/${role}`} replace />;

  const content = {
    waiting: {
      icon: Clock,
      title: 'Awaiting verification',
      body:
        role === 'vendor'
          ? "Thanks! We're checking your business licence. Watch your email: we'll let you know as soon as your store is verified."
          : "Thanks! We're checking your details. Watch your email: we'll let you know as soon as you can start delivering.",
    },
    rejected: {
      icon: ShieldX,
      title: 'Verification not approved',
      body: `Reason: ${verification?.rejection_reason ?? 'not given'}. You can update your details and submit them again.`,
    },
    suspended: {
      icon: Ban,
      title: 'Account suspended',
      body: `Reason: ${verification?.suspension_reason ?? 'not given'}. Contact Cydex support if you think this is a mistake.`,
    },
  }[access];
  const Icon = content.icon;

  return (
    <OnboardingLayout>
      <Card className="mt-6 flex flex-col items-center gap-4 p-8 text-center">
        <Icon className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">{content.title}</h1>
        <p className="max-w-md text-muted-foreground">{content.body}</p>
        {access === 'waiting' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MailCheck className="h-4 w-4" /> You'll also get a notification here.
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {access === 'rejected' && (
            <Button onClick={() => navigate(`/${role}/onboarding`)}>Edit and resubmit</Button>
          )}
          {access === 'waiting' && (
            <Button variant="outline" onClick={() => navigate(`/${role}/onboarding`)}>Edit my details</Button>
          )}
          <Button variant="outline" onClick={() => refetch()}>Check again</Button>
        </div>
      </Card>
    </OnboardingLayout>
  );
};

export default VerificationStatus;
