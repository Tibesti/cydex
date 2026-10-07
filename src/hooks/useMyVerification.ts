import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import type { Verification } from '@/lib/verification';

// The signed-in vendor's or rider's verification (null until they onboard)
export const useMyVerification = (enabled = true) => {
  const { user } = useAuth();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-verification', user?.id],
    enabled: enabled && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('verifications').select('*').eq('profile_id', user!.id).maybeSingle();
      if (error) throw error;
      return (data as Verification | null) ?? null;
    },
  });
  return { verification: data ?? null, loading: enabled && isLoading, refetch };
};
