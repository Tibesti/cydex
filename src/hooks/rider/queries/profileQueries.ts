
import { supabase } from '@/integrations/supabase/client';

export const fetchProfileData = async (userId: string) => {
  console.log('[ProfileQueries] Fetching profile data for user:', userId);
  
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[ProfileQueries] Error fetching profile:', error);
      throw error;
    }

    console.log('[ProfileQueries] Profile data fetched:', data);
    return data;
  } catch (error) {
    console.error('[ProfileQueries] Profile fetch failed:', error);
    throw error;
  }
};

export const fetchRiderData = async (userId: string) => {
  console.log('[ProfileQueries] Fetching rider data for user:', userId);
  
  try {
    // Try to fetch existing rider profile
    const { data, error } = await supabase
      .from('rider_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[ProfileQueries] Error fetching rider data:', error);
      throw error;
    }

    // If no rider profile exists, create a default one
    if (!data) {
      console.log('[ProfileQueries] No rider profile found, creating default');
      const { data: newProfile, error: createError } = await supabase
        .from('rider_profiles')
        .insert({
          id: userId,
          rider_status: 'offline',
          is_verified: false,
          rating: 0,
          total_deliveries: 0,
          vehicle_type: 'bicycle',
          verification_status: 'pending',
          notification_preferences: {
            app: true,
            email: true,
            sms: false,
            marketing: false
          }
        })
        .select()
        .single();

      if (createError) {
        console.error('[ProfileQueries] Error creating rider profile:', createError);
        throw createError;
      }

      console.log('[ProfileQueries] Created new rider profile:', newProfile);
      return newProfile;
    }

    console.log('[ProfileQueries] Rider data fetched:', data);
    return data;
  } catch (error) {
    console.error('[ProfileQueries] Rider data fetch failed:', error);
    throw error;
  }
};

export const fetchDeliveryStats = async (userId: string) => {
  console.log('[ProfileQueries] Fetching delivery stats for user:', userId);
  
  try {
    const { data, error } = await supabase
      .from('deliveries')
      .select('status, carbon_saved, created_at')
      .eq('rider_id', userId);

    if (error) {
      console.error('[ProfileQueries] Error fetching delivery stats:', error);
      throw error;
    }

    console.log('[ProfileQueries] Delivery stats fetched:', data);
    return data || [];
  } catch (error) {
    console.error('[ProfileQueries] Delivery stats fetch failed:', error);
    return [];
  }
};

export const fetchBankDetails = async (userId: string) => {
  console.log('[ProfileQueries] Fetching bank details for user:', userId);
  
  try {
    const { data, error } = await supabase
      .from('rider_bank_details')
      .select('*')
      .eq('rider_id', userId);

    if (error) {
      console.error('[ProfileQueries] Error fetching bank details:', error);
      throw error;
    }

    console.log('[ProfileQueries] Bank details fetched:', data);
    return data || [];
  } catch (error) {
    console.error('[ProfileQueries] Bank details fetch failed:', error);
    return [];
  }
};
