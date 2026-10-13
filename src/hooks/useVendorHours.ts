import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OpeningHours } from '@/lib/openingHours';

export interface VendorHoursInfo {
  vendor_id: string;
  is_open: boolean;
  hours_set: boolean;
  prep_time_minutes: number;
  today_open: string | null;
  today_close: string | null;
  opening_hours: OpeningHours;
}

// Open-now status, today's hours and preparation time for a list of vendors
export const useVendorHoursInfo = (vendorIds: string[]) => {
  const ids = [...new Set(vendorIds.filter(Boolean))].sort();
  const { data = [] } = useQuery({
    queryKey: ['vendor-hours-info', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vendor_hours_info', { p_vendor_ids: ids });
      if (error) throw error;
      return (data ?? []) as unknown as VendorHoursInfo[];
    },
  });
  const byId = new Map(data.map((h) => [h.vendor_id, h]));
  return { byId, get: (id: string | null | undefined) => (id ? byId.get(id) : undefined) };
};
