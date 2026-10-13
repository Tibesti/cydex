import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type VehicleType = Tables<'vehicle_types'>;

// "7 km", "1.5 km"
export const kmText = (km: number | null | undefined) => `${Number((Number(km ?? 0)).toFixed(2))} km`;

// Vehicle types are managed by admins (Admin -> Riders & vehicles).
// includeInactive: also the ones switched off (admin screens, old riders' types).
export const useVehicleTypes = (includeInactive = false) => {
  const { data = [], isLoading } = useQuery({
    queryKey: ['vehicle-types'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('vehicle_types').select('*').order('sort_order').order('key');
      if (error) throw error;
      return data ?? [];
    },
  });
  const types = includeInactive ? data : data.filter((t) => t.is_active);
  const byKey = (key: string | null | undefined) => data.find((t) => t.key === key);
  // The longest delivery Cydex does: as far as the furthest active mode goes
  // (each vehicle type's longest trip is set in Admin -> Riders & vehicles)
  const maxTripKm = Math.max(0, ...data.filter((t) => t.is_active).map((t) => Number(t.max_distance_km))) || 5;
  return {
    types,
    maxTripKm,
    /** e.g. "7 km" */
    maxTripText: kmText(maxTripKm),
    loading: isLoading,
    byKey,
    /** The rider-facing name, e.g. "Walking" */
    nameOf: (key: string | null | undefined) => byKey(key)?.name ?? (key ? key.replace(/_/g, ' ') : ''),
    /** What customers see, e.g. "Cydex Dashers" for walking */
    labelOf: (key: string | null | undefined) => {
      const t = byKey(key);
      return t ? t.customer_label || t.name : key ? key.replace(/_/g, ' ') : '';
    },
  };
};
