// One delivery mode on offer for a trip, as returned by the quote functions
// (checkout_quote, express_quote, rider_request_quote, batch_quote)
export interface DeliveryMode {
  key: string;
  /** What the customer sees, e.g. "Cydex Dashers" for walking */
  label: string;
  riders: number;
  /** A rider with this vehicle is free near the pickup right now, and the mode covers the trip */
  available: boolean;
  /** The trip is within how far this mode goes */
  in_range?: boolean;
  max_distance_km?: number;
  rate_per_km: number;
  delivery_fee: number;
  eta_min: number;
  eta_max: number;
}

export const NO_RIDERS_MESSAGE =
  'Our service is currently unavailable because all our riders are busy at the moment. Please check again later.';

// "About 20 min" or "20–35 min"
export const etaText = (min: number | null | undefined, max?: number | null) => {
  if (!min) return '';
  return max && max > min ? `${min}–${max} min` : `About ${min} min`;
};
