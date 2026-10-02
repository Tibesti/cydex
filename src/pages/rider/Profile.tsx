
import React, { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isValidPhone } from '@/lib/phone';
import type { PersonalDraft } from '@/components/rider/profile/tabs/PersonalInfoTab';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import LoadingDisplay from '@/components/ui/LoadingDisplay';
import RiderProfileHeader from '@/components/rider/profile/RiderProfileHeader';
import ProfileHeader from '@/components/rider/profile/ProfileHeader';
import VehicleInfo from '@/components/rider/profile/VehicleInfo';
import DocumentsVerification from '@/components/rider/profile/DocumentsVerification';
import ProfileTabs from '@/components/rider/profile/ProfileTabs';
import VehicleDialog from '@/components/rider/profile/dialogs/VehicleDialog';
import DocumentDialog from '@/components/rider/profile/dialogs/DocumentDialog';
import { useRiderProfileData } from '@/hooks/rider/useRiderProfileData';
import { toast } from 'sonner';

const RiderProfilePage = () => {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [showVehicleDialog, setShowVehicleDialog] = useState(false);
  const [showIdVerificationDialog, setShowIdVerificationDialog] = useState(false);
  
  const { 
    riderProfile, 
    recentReviews, 
    achievements, 
    loading, 
    error, 
    updateProfile,
    addBankDetails,
    refetchProfile
  } = useRiderProfileData();

  // The Personal tab's current values, so the header "Save Changes" saves what
  // the rider typed (not the profile as it was loaded)
  const queryClient = useQueryClient();
  const personalDraft = useRef<PersonalDraft | null>(null);
  const handleDraftChange = useCallback((draft: PersonalDraft) => {
    personalDraft.current = draft;
  }, []);

  const handleSaveProfile = async (updatedData?: Partial<PersonalDraft>) => {
    if (!riderProfile) {
      toast.error('No profile data to save');
      return;
    }

    const draft = updatedData ?? personalDraft.current;
    if (!draft) {
      setEditing(false);
      return;
    }
    const name = draft.name?.trim() ?? '';
    const phone = draft.phone?.trim() ?? '';
    if (!name) {
      toast.error('Enter your name');
      return;
    }
    if (!isValidPhone(phone)) {
      toast.error('Enter a valid phone number, e.g. 08012345678');
      return;
    }

    const success = await updateProfile({ name, phone, preferences: draft.preferences });
    if (success) {
      setEditing(false);
      // Clears the "add your phone number" notice
      queryClient.invalidateQueries({ queryKey: ['has-phone'] });
    }
  };

  const handleUpdateVehicle = async (vehicleData: any) => {
    console.log('[Profile] Updating vehicle with data:', vehicleData);
    
    if (!riderProfile) {
      toast.error('No profile data available');
      return;
    }
    
    const success = await updateProfile({
      vehicle: vehicleData
    });
    
    if (success) {
      setShowVehicleDialog(false);
      toast.success('Vehicle information updated');
    }
  };

  const handleUploadId = () => {
    setShowIdVerificationDialog(false);
    toast.success('Document uploaded successfully');
  };

  const handleAvatarUpdate = async (avatarUrl: string) => {
    console.log('[Profile] Avatar updated:', avatarUrl);
    // Refetch profile to get updated avatar
    await refetchProfile();
  };

  if (loading) {
    return (
      <DashboardLayout userRole="RIDER">
        <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto">
          <LoadingDisplay message="Loading profile..." />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !riderProfile) {
    return (
      <DashboardLayout userRole="RIDER">
        <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto">
          <Card>
            <CardContent className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {error || 'Profile not found'}
              </h3>
              <p className="text-gray-500">
                Please contact support if this issue persists.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="RIDER">
      <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto">
        <RiderProfileHeader 
          editing={editing}
          onEditToggle={() => setEditing(!editing)}
          onSave={() => handleSaveProfile()}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          {/* Left Column - Profile Info */}
          <div className="lg:col-span-1 space-y-3 sm:space-y-4 md:space-y-6">
            <Card>
              <CardContent className="p-3 sm:p-4 md:p-6">
                <ProfileHeader 
                  profile={riderProfile} 
                  editing={editing}
                  onAvatarUpdate={handleAvatarUpdate}
                />
              </CardContent>
            </Card>

            <VehicleInfo 
              vehicle={riderProfile.vehicle} 
              onUpdateVehicle={() => setShowVehicleDialog(true)} 
            />

            <DocumentsVerification 
              documents={riderProfile.documents} 
              onUpdateDocuments={() => setShowIdVerificationDialog(true)} 
            />
          </div>

          {/* Right Column - Tabs */}
          <div className="lg:col-span-2">
            <ProfileTabs 
              editing={editing} 
              profile={riderProfile} 
              recentReviews={recentReviews} 
              achievements={achievements}
              onAddBankDetails={addBankDetails}
              onSaveProfile={handleSaveProfile}
              onPersonalDraftChange={handleDraftChange}
            />
          </div>
        </div>
        
        {/* Vehicle Dialog */}
        <VehicleDialog 
          open={showVehicleDialog}
          onOpenChange={setShowVehicleDialog}
          vehicle={riderProfile.vehicle}
          onUpdate={handleUpdateVehicle}
        />
        
        {/* ID Verification Dialog */}
        <DocumentDialog 
          open={showIdVerificationDialog}
          onOpenChange={setShowIdVerificationDialog}
          onUpload={handleUploadId}
        />
      </div>
    </DashboardLayout>
  );
};

export default RiderProfilePage;
