// Live location tracking for riders, shared by every rider screen.
//
// Browsers only share location while the app is open (and, on phones, in the
// foreground); updates pause in the background and resume on return. The
// latest position is saved to rider_profiles.current_location, throttled so a
// moving rider writes at most every WRITE_EVERY_MS unless they move far.
import { supabase } from '@/integrations/supabase/client';
import { metersBetween } from '@/lib/googleMaps';

export type LocationPermission = 'checking' | 'granted' | 'prompt' | 'denied' | 'unsupported';

export interface RiderPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

export interface RiderLocationState {
  permission: LocationPermission;
  position: RiderPosition | null;
  // Human-readable place near the rider ("Faculty of Science"), set by the nav bar
  label: string | null;
  // Temporary problem getting a fix (weak GPS), not a permission issue
  error: string | null;
}

const WRITE_EVERY_MS = 30_000;
const WRITE_MIN_MOVE_M = 50;
const WRITE_MIN_GAP_MS = 5_000;
// Keeps tracking alive while the rider moves between pages
const STOP_DELAY_MS = 5_000;
// Re-save the location this often while the app is open (online heartbeat)
const HEARTBEAT_MS = 60_000;

let state: RiderLocationState = { permission: 'checking', position: null, label: null, error: null };
const listeners = new Set<() => void>();
let riderId: string | null = null;
let watchId: number | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let users = 0;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let permissionWatched = false;
let lastSaved: { at: number; lat: number; lng: number } | null = null;

const setState = (changes: Partial<RiderLocationState>) => {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener());
};

export const getRiderLocation = () => state;

export const subscribeRiderLocation = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const setRiderLocationLabel = (label: string | null) => {
  if (label !== state.label) setState({ label });
};

// Saving the location also marks the rider online ('available'). The database
// marks them offline once the saved location is 2 minutes old
// (mark_stale_riders_offline), so the heartbeat re-saves it while the app is open.
const save = async (position: RiderPosition, force = false) => {
  if (!riderId) return;
  const now = Date.now();
  if (lastSaved && !force) {
    const elapsed = now - lastSaved.at;
    const moved = metersBetween(
      { lat: lastSaved.lat, lng: lastSaved.lng },
      { lat: position.latitude, lng: position.longitude }
    );
    const due = elapsed >= WRITE_EVERY_MS || (moved >= WRITE_MIN_MOVE_M && elapsed >= WRITE_MIN_GAP_MS);
    if (!due) return;
  }
  lastSaved = { at: now, lat: position.latitude, lng: position.longitude };

  const { error } = await supabase.from('rider_profiles').upsert(
    {
      id: riderId,
      rider_status: 'available',
      current_location: { ...position, label: state.label, updated_at: new Date(now).toISOString() },
    },
    { onConflict: 'id' }
  );
  if (error) console.error('[RiderLocation] Could not save location:', error);
};

// Best effort: the database job catches anything this misses
const markOffline = async (id: string | null) => {
  if (!id) return;
  const { error } = await supabase.from('rider_profiles').update({ rider_status: 'offline' }).eq('id', id);
  if (error) console.error('[RiderLocation] Could not mark rider offline:', error);
};

const handlePosition = (geo: GeolocationPosition) => {
  const position: RiderPosition = {
    latitude: geo.coords.latitude,
    longitude: geo.coords.longitude,
    accuracy: geo.coords.accuracy,
    heading: geo.coords.heading,
    speed: geo.coords.speed,
    timestamp: geo.timestamp,
  };
  setState({ position, permission: 'granted', error: null });
  save(position);
};

const handleError = (error: GeolocationPositionError) => {
  if (error.code === error.PERMISSION_DENIED) {
    stopWatching();
    markOffline(riderId);
    setState({ permission: 'denied', error: null });
  } else {
    setState({ error: error.code === error.TIMEOUT ? 'Waiting for GPS signal…' : 'Location unavailable right now' });
  }
};

const startWatching = () => {
  if (watchId !== null || !riderId) return;
  watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
    enableHighAccuracy: true,
    maximumAge: 10_000,
    timeout: 30_000,
  });
  // Phones stop sending positions while the rider stands still; re-save the
  // last one so they stay online
  heartbeat = setInterval(() => {
    if (state.position && document.visibilityState === 'visible') save(state.position, true);
  }, HEARTBEAT_MS);
};

const stopWatching = () => {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (heartbeat) clearInterval(heartbeat);
  watchId = null;
  heartbeat = null;
};

// Tracks the browser permission so the app reacts when the rider changes it
const watchPermission = async () => {
  if (permissionWatched) return;
  permissionWatched = true;
  if (!navigator.permissions?.query) {
    // No Permissions API (older browsers): ask straight away
    startWatching();
    return;
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    const apply = () => {
      setState({ permission: status.state as LocationPermission });
      if (status.state === 'granted') {
        startWatching();
      } else {
        stopWatching();
        if (status.state === 'denied') markOffline(riderId);
      }
    };
    apply();
    status.onchange = apply;
  } catch {
    startWatching();
  }
};

// Starts tracking for this rider; call the returned function when done.
// Several screens can use it at once; it stops shortly after the last one leaves.
export const startRiderLocation = (userId: string) => {
  users += 1;
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }

  if (riderId !== userId) {
    stopWatching();
    riderId = userId;
    lastSaved = null;
    setState({ position: null, label: null, error: null });
  }

  if (!('geolocation' in navigator)) {
    setState({ permission: 'unsupported' });
  } else {
    watchPermission();
    if (state.permission === 'granted') startWatching();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    users -= 1;
    if (users <= 0) {
      stopTimer = setTimeout(() => {
        // Rider left the rider screens (or logged out)
        stopWatching();
        markOffline(riderId);
        riderId = null;
      }, STOP_DELAY_MS);
    }
  };
};

// Straight-line km from the rider to a delivery's pickup (the vendor's store),
// or null when either position is unknown. Same measure as the 5 km rule.
export const pickupDistanceKm = (pickupLocation: unknown, position: RiderPosition | null) => {
  const pickup = pickupLocation as { latitude?: unknown; longitude?: unknown } | null;
  if (!position || typeof pickup?.latitude !== 'number' || typeof pickup?.longitude !== 'number') return null;
  return (
    metersBetween(
      { lat: position.latitude, lng: position.longitude },
      { lat: pickup.latitude, lng: pickup.longitude }
    ) / 1000
  );
};

export const formatKm = (km: number | null) => (km === null ? '— km' : `${km.toFixed(1)} km`);

// Asks the browser for permission (shows its prompt the first time)
export const requestRiderLocation = () => {
  if (!('geolocation' in navigator)) return;
  stopWatching();
  startWatching();
};
