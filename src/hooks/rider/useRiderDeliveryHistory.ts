import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export interface RiderHistoryItem {
  id: string;
  order_number: string;
  status: string;
  order_type: string;
  created_at: string;
  delivered_at: string | null;
  delivery_address: { street?: string; formatted_address?: string } | null;
  vendor: { name: string | null } | null;
  deliveries: { rider_earning: number | null }[];
}

// Orders this rider has taken (any status), newest first, one page at a time
export const useRiderDeliveryHistory = (page: number, pageSize: number) => {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['rider-history', user?.id, page, pageSize],
    enabled: !!user?.id,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const { data, count, error } = await supabase
        .from('orders')
        .select(
          'id, order_number, status, order_type, created_at, delivered_at, delivery_address, vendor:profiles!orders_vendor_id_fkey(name), deliveries(rider_earning)',
          { count: 'exact' },
        )
        .eq('rider_id', user!.id)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      return { items: (data ?? []) as unknown as RiderHistoryItem[], total: count ?? 0 };
    },
  });
  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    pageCount: Math.max(1, Math.ceil((data?.total ?? 0) / pageSize)),
    isLoading,
  };
};
