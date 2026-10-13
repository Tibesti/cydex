import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';

// The product categories a vendor can use: the ones admins set for the
// vendor's business category (Admin -> Verifications -> Business categories)
export const useProductCategories = () => {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['product-categories', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: v } = await supabase.from('verifications').select('business_category_id').eq('profile_id', user!.id).maybeSingle();
      if (!v?.business_category_id) return { business: null as string | null, categories: [] as string[] };
      const [{ data: bc }, { data: pcs, error }] = await Promise.all([
        supabase.from('business_categories').select('name').eq('id', v.business_category_id).maybeSingle(),
        supabase.from('product_categories').select('name, sort_order').eq('business_category_id', v.business_category_id)
          .eq('is_active', true).order('sort_order').order('name'),
      ]);
      if (error) throw error;
      return { business: bc?.name ?? null, categories: (pcs ?? []).map((p) => p.name) };
    },
  });
  return { business: data?.business ?? null, categories: data?.categories ?? [], loading: isLoading };
};
