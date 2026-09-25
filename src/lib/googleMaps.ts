// Google Maps Platform settings shared by the address picker.
// Needs these APIs enabled on the key: Places API (New), Maps JavaScript API, Geocoding API.

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// Where the map opens before the customer picks anything (University of Ibadan)
export const DEFAULT_MAP_CENTER: google.maps.LatLngLiteral = { lat: 7.4443, lng: 3.8972 };

// Address suggestions are limited to Nigeria
export const ADDRESS_REGION_CODES = ['ng'];

export interface PickedLocation {
  place_name: string | null;
  formatted_address: string;
  street: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  place_id: string | null;
  latitude: number;
  longitude: number;
}

interface AddressComponentLike {
  longText: string | null;
  types: string[];
}

// Normalises components from Places (longText) and the Geocoder (long_name).
export const toComponents = (
  components: Array<google.maps.places.AddressComponent | google.maps.GeocoderAddressComponent> | null | undefined
): AddressComponentLike[] =>
  (components ?? []).map((c) => ({
    longText: 'longText' in c ? c.longText : c.long_name,
    types: c.types,
  }));

export const parseAddressComponents = (components: AddressComponentLike[]) => {
  const find = (...types: string[]) =>
    types.map((t) => components.find((c) => c.types.includes(t))?.longText).find(Boolean) ?? null;

  const streetNumber = find('street_number');
  const route = find('route');
  const street = [streetNumber, route].filter(Boolean).join(' ') || find('premise', 'neighborhood', 'sublocality') || null;

  return {
    street,
    city: find('locality', 'administrative_area_level_2', 'sublocality'),
    state: find('administrative_area_level_1'),
    country: find('country'),
  };
};

export const metersBetween = (a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
