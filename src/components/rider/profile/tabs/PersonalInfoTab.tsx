
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import PersonalInfoForm from './forms/PersonalInfoForm';
import NotificationSettingsCard from '@/components/notifications/NotificationSettingsCard';

export interface PersonalDraft {
  name: string;
  phone: string;
  preferences: { notifications: { app: boolean; email: boolean; sms: boolean; marketing: boolean } };
}

interface PersonalInfoTabProps {
  editing: boolean;
  profile: any;
  onSaveProfile?: (updatedData?: any) => Promise<void>;
  onDraftChange?: (draft: PersonalDraft) => void;
}

const PersonalInfoTab = ({ editing, profile, onSaveProfile, onDraftChange }: PersonalInfoTabProps) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
  });

  // Riders don't set delivery preferences (distance, zones, days): the order
  // radius is set by Cydex. Only notification preferences remain.
  const [preferences, setPreferences] = useState({
    notifications: {
      app: true,
      email: true,
      sms: false,
      marketing: false
    }
  });

  // Load the saved values whenever the rider isn't editing (initially and after
  // a save). While editing, keep what they've typed even if the profile reloads.
  useEffect(() => {
    if (!profile?.id || editing) return;
    setFormData({
      name: profile.name || '',
      email: profile.email || '',
      phone: profile.phone || '',
    });
    if (profile.preferences?.notifications) {
      setPreferences({ notifications: profile.preferences.notifications });
    }
  }, [profile, editing]);

  // Let the page's header "Save Changes" button save these values too
  useEffect(() => {
    onDraftChange?.({ name: formData.name, phone: formData.phone, preferences });
  }, [formData.name, formData.phone, preferences, onDraftChange]);

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
    } catch (error) {
      console.error('[PersonalInfoTab] Save error:', error);
      toast.error('Failed to save profile');
    }
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

      <div className="mt-4">
        <NotificationSettingsCard />
      </div>
    </>
  );
};

export default PersonalInfoTab;
