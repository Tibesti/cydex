import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  getRiderLocation,
  requestRiderLocation,
  startRiderLocation,
  subscribeRiderLocation,
} from '@/lib/riderLocation';

// Live location of the logged-in rider. Using it starts tracking (see
// src/lib/riderLocation.ts); every rider screen shares the same tracker.
export const useRiderLocation = () => {
  const { user } = useAuth();
  const location = useSyncExternalStore(subscribeRiderLocation, getRiderLocation);

  useEffect(() => {
    if (!user?.id) return;
    return startRiderLocation(user.id);
  }, [user?.id]);

  return {
    ...location,
    // Riders are online while their live location is coming through
    isOnline: location.permission === 'granted' && !!location.position,
    requestLocation: requestRiderLocation,
  };
};
