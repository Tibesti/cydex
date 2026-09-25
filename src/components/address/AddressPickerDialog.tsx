import React, { useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Crosshair, Loader2, MapPin, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  ADDRESS_REGION_CODES,
  DEFAULT_MAP_CENTER,
  GOOGLE_MAPS_API_KEY,
  PickedLocation,
  metersBetween,
  parseAddressComponents,
  toComponents,
} from '@/lib/googleMaps';
import { addressHeadline, errorMessage } from '@/lib/address';
import { Address, useAddresses } from '@/hooks/useAddresses';

const LABEL_PRESETS = ['Home', 'Hostel', 'Office'];
const MAP_ID = 'address-picker';

interface AddressPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Edit this address instead of adding a new one
  address?: Address | null;
  // Save with this label and hide the label/default choices (vendor store, rider)
  fixedLabel?: string;
  title?: string;
  description?: string;
  dismissLabel?: string;
  onSaved?: (address: Address) => void;
}

export const AddressPickerDialog: React.FC<AddressPickerDialogProps> = ({
  open,
  onOpenChange,
  address,
  fixedLabel,
  title,
  description,
  dismissLabel = 'Cancel',
  onSaved,
}) => {
  const { addresses, addAddress, updateAddress, isSaving } = useAddresses();
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [labelChoice, setLabelChoice] = useState('Home');
  const [customLabel, setCustomLabel] = useState('');
  const [directions, setDirections] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  // Remounts the map once the form is reset, so it opens on the right spot
  const [formKey, setFormKey] = useState(0);

  // Start from the address being edited (or a blank form) each time it opens
  useEffect(() => {
    if (!open) return;
    const isPreset = !address || LABEL_PRESETS.includes(address.label);
    setLocation(address ?? null);
    setLabelChoice(isPreset ? address?.label ?? 'Home' : 'Other');
    setCustomLabel(isPreset ? '' : address!.label);
    setDirections(address?.directions ?? '');
    setMakeDefault(false);
    setFormKey((key) => key + 1);
  }, [open, address]);

  const isFirstAddress = !address && addresses.length === 0;
  const canMakeDefault = !fixedLabel && !isFirstAddress && !address?.is_default;

  const handleSave = async () => {
    if (!location) {
      toast.error('Search for your address or move the pin on the map');
      return;
    }
    const input = {
      place_name: location.place_name,
      formatted_address: location.formatted_address,
      street: location.street,
      city: location.city,
      state: location.state,
      country: location.country,
      place_id: location.place_id,
      latitude: location.latitude,
      longitude: location.longitude,
      label: fixedLabel ?? (labelChoice === 'Other' ? customLabel.trim() || 'Other' : labelChoice),
      directions: directions.trim() || null,
      ...(makeDefault ? { is_default: true } : {}),
    };

    try {
      const saved = address ? await updateAddress({ id: address.id, ...input }) : await addAddress(input);
      toast.success(address ? 'Address updated' : 'Address saved');
      onSaved?.(saved);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving address:', error);
      toast.error(errorMessage(error, 'Could not save address'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {title ?? (address ? 'Edit address' : 'Add an address')}
          </DialogTitle>
          <DialogDescription>
            {description ?? 'Search for your address, then drag the map so the pin sits exactly where your delivery should go.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {GOOGLE_MAPS_API_KEY ? (
            <APIProvider apiKey={GOOGLE_MAPS_API_KEY} region="NG">
              <LocationPicker key={formKey} value={location} onChange={setLocation} />
            </APIProvider>
          ) : (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Address search is unavailable because VITE_GOOGLE_MAPS_API_KEY is not set.
            </p>
          )}

          {location && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">{addressHeadline(location)}</p>
              <p className="text-muted-foreground">{location.formatted_address}</p>
            </div>
          )}

          {!fixedLabel && (
            <div className="space-y-2">
              <Label>Save as</Label>
              <div className="flex flex-wrap gap-2">
                {[...LABEL_PRESETS, 'Other'].map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={labelChoice === option ? 'default' : 'outline'}
                    onClick={() => setLabelChoice(option)}
                  >
                    {option}
                  </Button>
                ))}
              </div>
              {labelChoice === 'Other' && (
                <Input
                  placeholder="e.g., Mum's place"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  maxLength={40}
                />
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="address-directions">Directions for the rider (optional)</Label>
            <Textarea
              id="address-directions"
              placeholder="e.g., Block C, Room 205, or Shop 12 beside the blue gate."
              value={directions}
              onChange={(e) => setDirections(e.target.value)}
              className="min-h-[70px]"
            />
          </div>

          {canMakeDefault && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={makeDefault} onCheckedChange={(checked) => setMakeDefault(checked === true)} />
              Make this my default delivery address
            </label>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {dismissLabel}
          </Button>
          <Button onClick={handleSave} disabled={!location || isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save address
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface LocationPickerProps {
  value: PickedLocation | null;
  onChange: (location: PickedLocation) => void;
}

// Search box with Google suggestions above a map with a fixed centre pin.
// Picking a suggestion moves the map; dragging the map moves the pin and
// looks up the address under it.
const LocationPicker: React.FC<LocationPickerProps> = ({ value, onChange }) => {
  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');
  const map = useMap(MAP_ID);
  const geocoder = useMemo(() => (geocoding ? new geocoding.Geocoder() : null), [geocoding]);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);

  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const skipNextSearch = useRef(false);
  // Position the current value represents (or is being looked up)
  const pinPosition = useRef<google.maps.LatLngLiteral | null>(
    value ? { lat: value.latitude, lng: value.longitude } : null
  );
  const userMovedMap = useRef(false);

  // Suggestions as the customer types (debounced)
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (!places || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      sessionToken.current ??= new places.AutocompleteSessionToken();
      try {
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: sessionToken.current,
          includedRegionCodes: ADDRESS_REGION_CODES,
          locationBias: { center: map?.getCenter()?.toJSON() ?? DEFAULT_MAP_CENTER, radius: 50000 },
        });
        if (cancelled) return;
        setSuggestions(suggestions.map((s) => s.placePrediction).filter(Boolean) as google.maps.places.PlacePrediction[]);
        setSearchFailed(false);
      } catch (error) {
        console.error('Address search failed:', error);
        if (!cancelled) setSearchFailed(true);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, places, map]);

  const moveMap = (position: google.maps.LatLngLiteral) => {
    if (!map) return;
    map.panTo(position);
    map.setZoom(17);
  };

  const lookUpPin = async (position: google.maps.LatLngLiteral) => {
    pinPosition.current = position;
    setResolving(true);
    let result: google.maps.GeocoderResult | undefined;
    try {
      const { results } = (await geocoder?.geocode({ location: position })) ?? { results: [] };
      result = results.find((r) => !r.types.includes('plus_code')) ?? results[0];
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
    }
    onChange({
      place_name: null,
      formatted_address:
        result?.formatted_address ?? `Pinned location (${position.lat.toFixed(5)}, ${position.lng.toFixed(5)})`,
      place_id: result?.place_id ?? null,
      latitude: position.lat,
      longitude: position.lng,
      ...parseAddressComponents(toComponents(result?.address_components)),
    });
    setResolving(false);
  };

  const selectSuggestion = async (prediction: google.maps.places.PlacePrediction) => {
    skipNextSearch.current = true;
    setQuery(prediction.text.text);
    setSuggestions([]);
    setResolving(true);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'] });
      sessionToken.current = null; // fetching details ends the billing session
      const position = place.location?.toJSON();
      if (!position) throw new Error('Place has no location');

      pinPosition.current = position;
      onChange({
        place_name: place.displayName ?? null,
        formatted_address: place.formattedAddress ?? prediction.text.text,
        place_id: place.id,
        latitude: position.lat,
        longitude: position.lng,
        ...parseAddressComponents(toComponents(place.addressComponents)),
      });
      moveMap(position);
    } catch (error) {
      console.error('Loading place failed:', error);
      toast.error("Couldn't load that place. Try another result or move the pin.");
    } finally {
      setResolving(false);
    }
  };

  const goToCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Your browser can't share your location. Search for your address instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const position = { lat: coords.latitude, lng: coords.longitude };
        moveMap(position);
        await lookUpPin(position);
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error('Could not get your location. Allow location access or search instead.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // After the map settles, treat a moved centre as a new pin position
  const handleIdle = (idleMap: google.maps.Map) => {
    const center = idleMap.getCenter()?.toJSON();
    if (!center) return;
    if (!pinPosition.current && !userMovedMap.current) return; // initial load
    if (pinPosition.current && metersBetween(center, pinPosition.current) < 10) return;
    lookUpPin(center);
  };

  const initialCenter = value ? { lat: value.latitude, lng: value.longitude } : DEFAULT_MAP_CENTER;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={places ? 'Search for your hostel, street or building' : 'Loading address search...'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!places}
          autoComplete="off"
        />
      </div>

      {searchFailed && (
        <p className="text-sm text-destructive">Address search failed. You can still move the pin on the map.</p>
      )}

      {suggestions.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-sm">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                onClick={() => selectSuggestion(s)}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">{s.mainText?.text ?? s.text.text}</span>
                  {s.secondaryText && (
                    <span className="block text-xs text-muted-foreground">{s.secondaryText.text}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative h-56 overflow-hidden rounded-md border">
        <Map
          id={MAP_ID}
          defaultCenter={initialCenter}
          defaultZoom={value ? 17 : 15}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          clickableIcons={false}
          onDragstart={() => {
            userMovedMap.current = true;
          }}
          onIdle={(event) => handleIdle(event.map)}
          className="h-full w-full"
        />
        {/* Fixed pin: the map moves underneath it */}
        <MapPin className="pointer-events-none absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-full fill-primary text-background drop-shadow-md" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/50" />

        {resolving && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-background/90 px-2 py-1 text-xs shadow">
            <Loader2 className="h-3 w-3 animate-spin" /> Finding address...
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className={cn('absolute bottom-2 left-2 shadow', locating && 'pointer-events-none')}
          onClick={goToCurrentLocation}
        >
          {locating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Crosshair className="mr-1 h-4 w-4" />}
          Use my location
        </Button>
      </div>
    </div>
  );
};
