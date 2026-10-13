import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export interface MyPromotion {
  id: string;
  name: string;
  /** null: applied automatically. Otherwise the code to enter when paying. */
  code: string | null;
  discount_type: string;
  discount_value: number;
  applies_to: string;
  vendor_id: string | null;
  vendor_name: string | null;
  max_distance_km: number | null;
  vehicle_types: string[] | null;
  ends_at: string;
  /** How many more times they can use it (null: no limit) */
  uses_left: number | null;
  /** Places left for people who haven't used it yet (null: no limit) */
  places_left: number | null;
}

export const MY_PROMOTIONS_KEY = 'my-promotions';

// The promotions the signed-in customer, vendor or rider can still use
// (my_promotions): the automatic ones first, then coupon codes
export const useMyPromotions = () => {
  const { user } = useAuth();
  const { data: offers = [] } = useQuery({
    queryKey: [MY_PROMOTIONS_KEY, user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_promotions');
      if (error) throw error;
      return (data ?? []) as MyPromotion[];
    },
  });
  return offers;
};
