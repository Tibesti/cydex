import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export interface VendorStats {
  total_orders: number;
  delivered_orders: number;
  /** What the vendor has been paid on delivered orders (after Cydex's commission) */
  total_revenue: number;
  total_carbon_saved: number;
  rating: number;
  rating_count: number;
}

// The vendor dashboard's figures, calculated from their orders and ratings
// (vendor_dashboard_stats). Refreshes every minute and when the tab regains focus.
export const useVendorStats = () => {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['vendor-dashboard-stats', user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vendor_dashboard_stats');
      if (error) throw error;
      const s = (data ?? {}) as Record<string, number | string>;
      return {
        total_orders: Number(s.total_orders ?? 0),
        delivered_orders: Number(s.delivered_orders ?? 0),
        total_revenue: Number(s.total_revenue ?? 0),
        total_carbon_saved: Number(s.total_carbon_saved ?? 0),
        rating: Number(s.rating ?? 0),
        rating_count: Number(s.rating_count ?? 0),
      } satisfies VendorStats;
    },
  });

  return {
    stats: data ?? null,
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
};
