import { useEffect } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Loader2, MapPin, MapPinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRiderLocation } from '@/hooks/useRiderLocation';
import { GOOGLE_MAPS_API_KEY, metersBetween } from '@/lib/googleMaps';
import { RiderPosition, setRiderLocationLabel } from '@/lib/riderLocation';

// Re-label the rider's position only after they've moved this far, at most this often
const RELABEL_AFTER_M = 200;
const RELABEL_EVERY_MS = 60_000;
let lastLabelled: { lat: number; lng: number; at: number } | null = null;

// Looks up a short place name for the rider's position (Geocoding API)
const PlaceLabeler = ({ position }: { position: RiderPosition }) => {
  const geocoding = useMapsLibrary('geocoding');

  useEffect(() => {
    if (!geocoding) return;
    const here = { lat: position.latitude, lng: position.longitude };
    if (lastLabelled) {
      const moved = metersBetween({ lat: lastLabelled.lat, lng: lastLabelled.lng }, here);
      if (moved < RELABEL_AFTER_M || Date.now() - lastLabelled.at < RELABEL_EVERY_MS) return;
    }
    lastLabelled = { ...here, at: Date.now() };

    new geocoding.Geocoder()
      .geocode({ location: here })
      .then(({ results }) => {
        const result = results.find((r) => !r.types.includes('plus_code'));
        setRiderLocationLabel(result ? result.formatted_address.split(',')[0] : null);
      })
      .catch((error) => console.error('[RiderLocationBar] Reverse geocoding failed:', error));
  }, [geocoding, position.latitude, position.longitude]);

  return null;
};

// Rider nav bar: live location status and the place they're near
const RiderLocationBar = () => {
  const { permission, position, label, error, requestLocation } = useRiderLocation();

  return (
    <div className="bg-background px-3 sm:px-4 md:px-6 py-2 text-sm">
      {GOOGLE_MAPS_API_KEY && position && (
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} region="NG">
          <PlaceLabeler position={position} />
        </APIProvider>
      )}

      {permission === 'checking' ? (
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
      ) : permission === 'granted' ? (
        position ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
            <span className="shrink-0 text-muted-foreground">Live</span>
            <span className="min-w-0 truncate font-medium">{label ? `Near ${label}` : 'Location on'}</span>
            {error && <span className="shrink-0 text-xs text-muted-foreground">· {error}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {error ?? 'Finding your location…'}
          </div>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <MapPinOff className="h-4 w-4 text-destructive" />
          <span className="text-destructive">
            {permission === 'unsupported' ? "This browser can't share your location" : 'Location is off'}
          </span>
          {permission === 'prompt' && (
            <Button size="sm" variant="outline" className="h-7" onClick={requestLocation}>
              <MapPin className="mr-1 h-3.5 w-3.5" />
              Turn on
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default RiderLocationBar;
