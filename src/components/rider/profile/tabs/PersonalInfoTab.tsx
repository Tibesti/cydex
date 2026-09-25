
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import PersonalInfoForm from './forms/PersonalInfoForm';
import DeliveryPreferencesForm from './forms/DeliveryPreferencesForm';
import NotificationPreferencesForm from './forms/NotificationPreferencesForm';

interface PersonalInfoTabProps {
  editing: boolean;
  profile: any;
  onSaveProfile?: (updatedData?: any) => Promise<void>;
}

const PersonalInfoTab = ({ editing, profile, onSaveProfile }: PersonalInfoTabProps) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const [preferences, setPreferences] = useState({
    deliveryPreferences: {
      maxDistance: 15,
      preferredZones: [],
      availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    },
    notifications: {
      app: true,
      email: true,
      sms: false,
      marketing: false
    }
  });

  const initializedRef = useRef(false);

  // Initialize form data when profile is available
  useEffect(() => {
    if (profile?.id && !initializedRef.current) {
      console.log('[PersonalInfoTab] Initializing form with profile:', profile);
      
      setFormData({
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
      });
      
      if (profile.preferences) {
        setPreferences(profile.preferences);
      }
      
      initializedRef.current = true;
    }
  }, [profile]);

  // Reset initialization flag when profile ID changes
  useEffect(() => {
    if (profile?.id) {
      initializedRef.current = false;
    }
  }, [profile?.id]);

  const handleInputChange = (field: string, value: string) => {
    console.log('[PersonalInfoTab] Input change:', field, value);
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!onSaveProfile) {
      toast.error('Save function not available');
      return;
    }

    console.log('[PersonalInfoTab] Saving profile data:', { formData, preferences });
    
    try {
      const updateData = {
        name: formData.name,
        phone: formData.phone,
        preferences
      };
      
      await onSaveProfile(updateData);
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('[PersonalInfoTab] Save error:', error);
      toast.error('Failed to save profile');
    }
  };

  const handleDistanceChange = (value: number[]) => {
    const newDistance = value[0];
    console.log('[PersonalInfoTab] Distance change:', newDistance);
    setPreferences(prev => ({
      ...prev,
      deliveryPreferences: { 
        ...prev.deliveryPreferences, 
        maxDistance: newDistance 
      }
    }));
  };

  const handleNotificationChange = (field: string, checked: boolean) => {
    console.log('[PersonalInfoTab] Notification change:', field, checked);
    setPreferences(prev => ({
      ...prev,
      notifications: { 
        ...prev.notifications, 
        [field]: checked 
      }
    }));
  };

  return (
    <>
      <PersonalInfoForm
        formData={formData}
        editing={editing}
        onInputChange={handleInputChange}
        onSave={handleSave}
      />

      <DeliveryPreferencesForm
        preferences={preferences.deliveryPreferences}
        editing={editing}
        onDistanceChange={handleDistanceChange}
        onSave={handleSave}
      />

      <NotificationPreferencesForm
        preferences={preferences.notifications}
        editing={editing}
        onNotificationChange={handleNotificationChange}
        onSave={handleSave}
      />
    </>
  );
};

export default PersonalInfoTab;
