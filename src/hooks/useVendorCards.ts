import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAddresses } from '@/hooks/useAddresses';

export interface VendorCardData {
  vendor_id: string;
  name: string;
  logo_url: string | null;
  banner_url: string | null;
  verified: boolean;
  distance_km: number;
  product_count: number;
  categories: string[];
  average_rating: number | null;
  rating_count: number;
  /** Paid orders (not cancelled/rejected) in the last 30 days */
  recent_orders: number;
}

// Vendors within 5 km of the customer's default delivery address that have
// something to sell, nearest first (vendor_cards_near_address)
export const useVendorCards = () => {
  const { defaultAddress, hasLoaded } = useAddresses();

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendor-cards', defaultAddress?.id],
    enabled: !!defaultAddress?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vendor_cards_near_address', { p_address_id: defaultAddress!.id });
      if (error) throw error;
      return (data ?? [])
        .map((v) => ({ ...v, distance_km: Number(v.distance_km), average_rating: v.average_rating == null ? null : Number(v.average_rating) }))
        .filter((v) => v.product_count > 0)
        .sort((a, b) => a.distance_km - b.distance_km) as VendorCardData[];
    },
  });

  return {
    vendors,
    defaultAddress,
    loading: !hasLoaded || (!!defaultAddress && isLoading),
  };
};
