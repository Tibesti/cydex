import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import type { PickedLocation } from '@/lib/googleMaps';

export interface Address extends PickedLocation {
  id: string;
  profile_id: string;
  label: string;
  directions: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type AddressInput = PickedLocation & {
  label: string;
  directions: string | null;
  is_default?: boolean;
};

// Saved addresses of the logged-in user (any role). Customers can have many;
// vendors (store location) and riders have one. The database keeps exactly one
// default and enforces the per-role limit (migration 20260925120000_shared_addresses).
export const useAddresses = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['addresses', user?.id];

  const { data: addresses = [], isLoading, isFetched } = useQuery({
    queryKey,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .eq('profile_id', user!.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Address[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const addAddress = useMutation({
    mutationFn: async (input: AddressInput) => {
      const { data, error } = await supabase
        .from('addresses')
        .insert({ ...input, profile_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as Address;
    },
    onSuccess: refresh,
  });

  const updateAddress = useMutation({
    mutationFn: async ({ id, ...changes }: Partial<AddressInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('addresses')
        .update(changes)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Address;
    },
    onSuccess: refresh,
  });

  const deleteAddress = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('addresses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return {
    addresses,
    // Customers: the delivery address. Vendors/riders: their only address.
    defaultAddress: addresses.find((a) => a.is_default) ?? addresses[0] ?? null,
    isLoading,
    // True once the first fetch finished, so "no addresses" can be trusted
    hasLoaded: isFetched,
    addAddress: addAddress.mutateAsync,
    updateAddress: updateAddress.mutateAsync,
    deleteAddress: deleteAddress.mutateAsync,
    setDefaultAddress: (id: string) => updateAddress.mutateAsync({ id, is_default: true }),
    isSaving: addAddress.isPending || updateAddress.isPending,
  };
};
