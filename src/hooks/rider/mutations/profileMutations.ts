import { supabase } from '@/integrations/supabase/client';
import { RiderProfileData, BankDetail } from '../types';

export const updateProfile = async (userId: string, updates: Partial<RiderProfileData>) => {
  console.log('[ProfileMutations] Starting profile update for user:', userId);
  console.log('[ProfileMutations] Update data:', updates);

  try {
    // First, check if rider profile exists, if not create it
    const { data: existingRiderProfile } = await supabase
      .from('rider_profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!existingRiderProfile) {
      console.log('[ProfileMutations] Creating new rider profile');
      const { error: createError } = await supabase
        .from('rider_profiles')
        .insert({
          id: userId,
          rider_status: 'offline',
          is_verified: false,
          rating: 0,
          total_deliveries: 0,
          vehicle_type: 'bicycle',
          verification_status: 'pending'
        });

      if (createError) {
        console.error('[ProfileMutations] Error creating rider profile:', createError);
        throw createError;
      }
    }

    // Update profiles table (basic user info)
    const profileUpdate: any = {};
    if (updates.name !== undefined) profileUpdate.name = updates.name;
    if (updates.phone !== undefined) profileUpdate.phone = updates.phone;
    
    if (Object.keys(profileUpdate).length > 0) {
      console.log('[ProfileMutations] Updating profiles table:', profileUpdate);
      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId);

      if (profileError) {
        console.error('[ProfileMutations] Profile update error:', profileError);
        throw profileError;
      }
    }

    // Update rider_profiles table for preferences and other rider-specific data
    const riderUpdate: any = {};
    
    if (updates.vehicle) {
      riderUpdate.vehicle_type = updates.vehicle.type || 'bicycle';
      riderUpdate.license_number = updates.vehicle.licensePlate || null;
      riderUpdate.vehicle_registration = updates.vehicle.registration || null;
    }

    if (updates.preferences) {
      if (updates.preferences.notifications) {
        riderUpdate.notification_preferences = {
          app: updates.preferences.notifications.app !== undefined ? updates.preferences.notifications.app : true,
          email: updates.preferences.notifications.email !== undefined ? updates.preferences.notifications.email : true,
          sms: updates.preferences.notifications.sms !== undefined ? updates.preferences.notifications.sms : false,
          marketing: updates.preferences.notifications.marketing !== undefined ? updates.preferences.notifications.marketing : false
        };
      }
    }

    if (Object.keys(riderUpdate).length > 0) {
      riderUpdate.updated_at = new Date().toISOString();
      
      console.log('[ProfileMutations] Updating rider_profiles table:', riderUpdate);
      const { error: riderError } = await supabase
        .from('rider_profiles')
        .update(riderUpdate)
        .eq('id', userId);

      if (riderError) {
        console.error('[ProfileMutations] Rider profile update error:', riderError);
        throw riderError;
      }
    }

    console.log('[ProfileMutations] Profile update completed successfully');
    return true;
  } catch (error) {
    console.error('[ProfileMutations] Profile update failed:', error);
    throw error;
  }
};

export const updateRiderStatus = async (userId: string, isOnline: boolean) => {
  console.log('[ProfileMutations] Updating rider status:', { userId, isOnline });
  
  try {
    // First ensure rider profile exists
    const { data: existingRiderProfile } = await supabase
      .from('rider_profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (!existingRiderProfile) {
      // Create rider profile if it doesn't exist
      const { error: createError } = await supabase
        .from('rider_profiles')
        .insert({
          id: userId,
          rider_status: isOnline ? 'available' : 'offline',
          is_verified: false,
          rating: 0,
          total_deliveries: 0,
          vehicle_type: 'bicycle',
          verification_status: 'pending'
        });

      if (createError) {
        console.error('[ProfileMutations] Error creating rider profile for status update:', createError);
        throw createError;
      }
    } else {
      // Update existing rider profile
      const { error } = await supabase
        .from('rider_profiles')
        .update({
          rider_status: isOnline ? 'available' : 'offline',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        console.error('[ProfileMutations] Status update error:', error);
        throw error;
      }
    }
    
    console.log('[ProfileMutations] Status updated successfully');
    return true;
  } catch (error) {
    console.error('[ProfileMutations] Status update failed:', error);
    throw error;
  }
};

export const addBankDetails = async (userId: string, bankDetails: Omit<BankDetail, 'id' | 'is_verified' | 'is_default'>) => {
  console.log('[ProfileMutations] Adding bank details for user:', userId);
  
  try {
    const { error } = await supabase
      .from('rider_bank_details')
      .insert({
        rider_id: userId,
        account_name: bankDetails.account_name,
        account_number: bankDetails.account_number,
        bank_name: bankDetails.bank_name,
        bvn: bankDetails.bvn || null,
        is_verified: false,
        is_default: false
      });

    if (error) {
      console.error('[ProfileMutations] Bank details add error:', error);
      throw error;
    }
    
    console.log('[ProfileMutations] Bank details added successfully');
    return true;
  } catch (error) {
    console.error('[ProfileMutations] Bank details add failed:', error);
    throw error;
  }
};
