import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { isValidPhone } from '@/lib/phone';

// Whether the signed-in user has a phone number on their profile. Vendors need
// one to accept orders and riders to accept deliveries (enforced in the database).
// Assumes true until loaded, so buttons don't flash disabled.
export const useHasPhone = () => {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['has-phone', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('phone').eq('id', user!.id).single();
      if (error) throw error;
      return isValidPhone(data?.phone);
    },
  });
  return data ?? true;
};
