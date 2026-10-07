import { useNavigate } from 'react-router-dom';
import { Loader2, MapPin, MapPinOff } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useRiderLocation } from '@/hooks/useRiderLocation';

// Riders must share their live location while using the app. This covers the
// rider screens until location is allowed; it can't be dismissed, only
// resolved (or the rider logs out).
const RiderLocationGate = () => {
  const { permission, requestLocation } = useRiderLocation();
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Blocks everything until location is confirmed, including the first check
  const open = permission !== 'granted';

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {permission === 'checking' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : permission === 'prompt' ? (
              <MapPin className="h-5 w-5" />
            ) : (
              <MapPinOff className="h-5 w-5 text-destructive" />
            )}
            {permission === 'checking' && 'Checking your location…'}
            {permission === 'prompt' && 'Turn on your location'}
            {permission === 'denied' && 'Location is blocked'}
            {permission === 'unsupported' && "Location isn't available"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {permission === 'checking' && <p>Riders need location turned on to use Cydex.</p>}
              {permission === 'prompt' && (
                <p>
                  Riders need to share their live location while using Cydex. It's used to show deliveries near you and
                  to let customers follow their order. It's only shared while the app is open.
                </p>
              )}
              {permission === 'denied' && (
                <>
                  <p>Your browser is blocking location for Cydex. To turn it on:</p>
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>
                      Tap the <strong>lock</strong> (or <strong>aA</strong> on iPhone) next to the web address.
                    </li>
                    <li>
                      Open <strong>Site settings</strong> / <strong>Website settings</strong>, then <strong>Location</strong>.
                    </li>
                    <li>
                      Choose <strong>Allow</strong>, then come back and tap <strong>Try again</strong>.
                    </li>
                  </ol>
                  <p className="text-xs">On iPhone, also check Settings → Privacy &amp; Security → Location Services is on for Safari.</p>
                </>
              )}
              {permission === 'unsupported' && (
                <p>This browser can't share your location. Open Cydex in a recent version of Chrome or Safari.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleLogout}>
            Log out
          </Button>
          {(permission === 'prompt' || permission === 'denied') && (
            <Button onClick={requestLocation}>{permission === 'denied' ? 'Try again' : 'Allow location'}</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default RiderLocationGate;
