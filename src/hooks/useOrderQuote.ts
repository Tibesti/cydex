import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type QuoteStatus = 'ok' | 'no_address' | 'no_store' | 'out_of_range';

// A type (not an interface) so it can be passed to the database as JSON
export type CartLine = {
  product_id: string;
  quantity: number;
};

export interface OrderQuote {
  status: QuoteStatus;
  subtotal: number;
  distance_km: number | null;
  base_rate: number | null;
  distance_fee: number | null;
  delivery_fee: number | null;
  service_charge: number;
  total_amount: number | null;
}

const toNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));

// Price of an order before it's placed, calculated by the database
// (quote_order): items at current product prices, the Service Charge, and the
// delivery fee from the vendor's store to the address. The app only sends
// product ids and quantities; place_order prices the real order the same way.
export const useOrderQuote = (
  vendorId: string | null | undefined,
  addressId: string | null | undefined,
  items: CartLine[]
) => {
  const enabled = !!vendorId && !!addressId && items.length > 0;

  const { data, isLoading, error } = useQuery({
    queryKey: ['order-quote', vendorId, addressId, items],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('quote_order', {
        p_vendor_id: vendorId!,
        p_address_id: addressId!,
        p_items: items,
      });
      if (error) throw error;
      const row = data?.[0];
      if (!row) throw new Error('No quote returned');
      return {
        status: row.status as QuoteStatus,
        subtotal: Number(row.subtotal),
        distance_km: toNumber(row.distance_km),
        base_rate: toNumber(row.base_rate),
        distance_fee: toNumber(row.distance_fee),
        delivery_fee: toNumber(row.delivery_fee),
        service_charge: Number(row.service_charge),
        total_amount: toNumber(row.total_amount),
      } satisfies OrderQuote;
    },
  });

  return { quote: enabled ? data ?? null : null, isLoading: enabled && isLoading, error };
};

// Cart items → the lines sent to the database
export const toCartLines = (items: { id: string; quantity: number }[]): CartLine[] =>
  items.map((item) => ({ product_id: item.id, quantity: item.quantity }));
