import type { Address } from '@/hooks/useAddresses';

// Supabase errors are plain objects with a message, not Error instances
export const errorMessage = (error: unknown, fallback: string) =>
  (error as { message?: string } | null)?.message || fallback;

// First line of an address, e.g. "Faculty of Science" or "12 Ring Road"
export const addressHeadline = (address: Pick<Address, 'place_name' | 'street' | 'formatted_address'>) =>
  address.place_name || address.street || address.formatted_address.split(',')[0];

