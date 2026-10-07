import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { VerifiedBadge } from '@/components/customer/vendors/VendorBadges';
import { useMyVerification } from '@/hooks/useMyVerification';

// The store's verification state in Settings, with a way to apply for the badge
const VerificationCard = () => {
  const navigate = useNavigate();
  const { verification } = useMyVerification();
  if (!verification) return null;

  return (
    <div className="w-full space-y-2 rounded-lg border p-3 text-sm">
      <VerifiedBadge verified={verification.status === 'verified'} />
      {verification.status === 'unverified' && (
        <>
          <p className="text-muted-foreground">Upload your business licence to get the verified badge customers look for.</p>
          <Button size="sm" variant="outline" className="w-full" onClick={() => navigate('/vendor/onboarding')}>
            Get verified
          </Button>
        </>
      )}
      {verification.status === 'pending' && (
        <p className="text-muted-foreground">Your licence is being reviewed. You can keep selling meanwhile.</p>
      )}
    </div>
  );
};

export default VerificationCard;
