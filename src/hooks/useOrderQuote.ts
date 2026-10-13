import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DeliveryMode } from '@/lib/deliveryModes';

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
  /** The delivery mode the price is for (their choice if a rider with it is free) */
  vehicle_type: string | null;
  /** The flat charge added to every delivery */
  base_rate: number | null;
  distance_fee: number | null;
  delivery_fee: number | null;
  service_charge: number;
  /** Promotion or coupon */
  discount_amount: number;
  discount_target: 'service_charge' | 'delivery_fee' | 'items' | null;
  promotion_name: string | null;
  coupon_status: 'none' | 'applied' | 'invalid';
  /** Why the coupon wasn't accepted */
  coupon_message: string | null;
  /** How many more times they can use the promotion applied (null: no limit) */
  promotion_uses_left: number | null;
  total_amount: number | null;
  /** Wallet first, card for the rest */
  wallet_balance: number;
  wallet_amount: number;
  card_amount: number;
  vendor_open: boolean;
  prep_time_minutes: number;
  riders_available: boolean;
  modes: DeliveryMode[];
  eta_min: number | null;
  eta_max: number | null;
}

const toNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));

// Everything checkout needs, calculated by the database (checkout_quote):
// items at current product prices, the Service Charge, the delivery fee for
// the chosen delivery mode, any promotion, the delivery modes on offer, whether
// a rider is free, whether the vendor is open, and the wallet / card split.
// The app only sends product ids and quantities; place_order prices the real
// order the same way.
export const useOrderQuote = (
  vendorId: string | null | undefined,
  addressId: string | null | undefined,
  items: CartLine[],
  vehicleType?: string | null,
  couponCode?: string | null,
) => {
  const enabled = !!vendorId && !!addressId && items.length > 0;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['order-quote', vendorId, addressId, items, vehicleType ?? null, couponCode ?? null],
    enabled,
    placeholderData: (previous) => previous,
    // Riders come and go: keep the "is anyone free" answer fresh while checkout is open
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('checkout_quote', {
        p_vendor_id: vendorId!,
        p_address_id: addressId!,
        p_items: items,
        p_vehicle_type: vehicleType ?? undefined,
        p_coupon_code: couponCode?.trim() || undefined,
      });
      if (error) throw error;
      const row = data as Record<string, unknown> | null;
      if (!row) throw new Error('No quote returned');
      return {
        status: row.status as QuoteStatus,
        subtotal: Number(row.subtotal),
        distance_km: toNumber(row.distance_km),
        vehicle_type: (row.vehicle_type as string | null) ?? null,
        base_rate: toNumber(row.base_rate),
        distance_fee: toNumber(row.distance_fee),
        delivery_fee: toNumber(row.delivery_fee),
        service_charge: Number(row.service_charge),
        discount_amount: Number(row.discount_amount ?? 0),
        discount_target: (row.discount_target as OrderQuote['discount_target']) ?? null,
        promotion_name: (row.promotion_name as string | null) ?? null,
        coupon_status: (row.coupon_status as OrderQuote['coupon_status']) ?? 'none',
        coupon_message: (row.coupon_message as string | null) ?? null,
        promotion_uses_left: toNumber(row.promotion_uses_left),
        total_amount: toNumber(row.total_amount),
        wallet_balance: Number(row.wallet_balance ?? 0),
        wallet_amount: Number(row.wallet_amount ?? 0),
        card_amount: Number(row.card_amount ?? 0),
        vendor_open: row.vendor_open !== false,
        prep_time_minutes: Number(row.prep_time_minutes ?? 0),
        riders_available: row.riders_available === true,
        modes: ((row.modes as DeliveryMode[] | null) ?? []).map((m) => ({
          ...m, delivery_fee: Number(m.delivery_fee), rate_per_km: Number(m.rate_per_km),
        })),
        eta_min: toNumber(row.eta_min),
        eta_max: toNumber(row.eta_max),
      } satisfies OrderQuote;
    },
  });

  return { quote: enabled ? data ?? null : null, isLoading: enabled && isLoading, isFetching: enabled && isFetching, error };
};

// Cart items → the lines sent to the database
export const toCartLines = (items: { id: string; quantity: number }[]): CartLine[] =>
  items.map((item) => ({ product_id: item.id, quantity: item.quantity }));
