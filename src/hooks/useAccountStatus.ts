import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';

// The signed-in customer's account status (admins can suspend customers)
export const useAccountStatus = (enabled = true) => {
  const { user } = useAuth();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['account-status', user?.id],
    enabled: enabled && !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('status, suspension_reason').eq('id', user!.id).single();
      if (error) throw error;
      return data;
    },
  });
  return {
    suspended: data?.status === 'suspended',
    reason: data?.suspension_reason ?? null,
    loading: enabled && isLoading,
    refetch,
  };
};
