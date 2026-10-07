import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';

import ProfileAvatar from '@/components/customer/profile/ProfileAvatar';
import ProfileForm from '@/components/customer/profile/ProfileForm';
import SecuritySettings from '@/components/customer/profile/SecuritySettings';
import PreferencesSettings from '@/components/customer/profile/PreferencesSettings';
import AccountSummary from '@/components/customer/profile/AccountSummary';
import RecentActivity from '@/components/customer/profile/RecentActivity';
import SavedAddresses from '@/components/customer/address/SavedAddresses';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const ProfilePage = () => {
  const { user } = useAuth();
  // ?tab=addresses opens Saved addresses (linked from the Deliver to bar)
  const [searchParams] = useSearchParams();

  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user's profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) {
        toast({
          variant: "destructive",
          title: "Error loading profile",
          description: error.message
        });
        setLoading(false);
        return;
      }
      setProfileData({
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || "",
        dateJoined: data.created_at
          ? new Date(data.created_at).toLocaleString("en-NG", {
              year: "numeric",
              month: "long"
            })
          : "",
        carbonCredits: data.carbon_credits ?? 0,
        ordersCompleted: 0, // If available in another table, fetch and populate
        sustainabilityScore: 8.7 // Placeholder, if you have a sourced metric, replace
      });
      setLoading(false);
    };

    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    setIsEditing(false);
    // Addresses are managed in the Saved addresses tab
    const updates: any = {
      name: profileData.name,
      phone: profileData.phone,
    };
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);
    if (error) {
      toast({
        variant: "destructive",
        title: "Profile update failed",
        description: error.message,
      });
    } else {
      toast({
        variant: "default",   // Fixed: "success" not allowed, use "default"
        title: "Profile updated successfully!"
      });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setProfileData((prev: any) => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading || !profileData) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="p-2 sm:p-4 md:p-6 max-w-full mx-auto space-y-3 sm:space-y-4 md:space-y-6">
          <div className="animate-pulse h-44 rounded bg-muted mb-4"></div>
          <div className="animate-pulse h-96 rounded bg-muted"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="CUSTOMER">
      <div className="p-2 sm:p-4 md:p-6 max-w-full mx-auto space-y-3 sm:space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">My Profile</h1>
            <p className="text-sm sm:text-base text-gray-600">
              Manage your profile information and settings
            </p>
          </div>
          <Button 
            onClick={() => setIsEditing(true)} 
            disabled={isEditing}
            className="text-sm sm:text-base w-full sm:w-auto"
          >
            <Settings className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            Edit Profile
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Profile Information</CardTitle>
            <CardDescription className="text-sm">View and update your personal details</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs defaultValue={searchParams.get('tab') ?? 'account'} className="w-full">
              <TabsList className="mb-3 sm:mb-4 w-full">
                <TabsTrigger value="account" className="text-xs sm:text-sm flex-1">Account</TabsTrigger>
                <TabsTrigger value="addresses" className="text-xs sm:text-sm flex-1">
                  <span className="sm:hidden">Addresses</span>
                  <span className="hidden sm:inline">Saved addresses</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="text-xs sm:text-sm flex-1">Security</TabsTrigger>
                <TabsTrigger value="preferences" className="text-xs sm:text-sm flex-1">Preferences</TabsTrigger>
              </TabsList>

              <TabsContent value="account">
                <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
                  <ProfileAvatar name={profileData.name} />
                  <ProfileForm 
                    profileData={profileData}
                    isEditing={isEditing}
                    handleInputChange={handleInputChange}
                    handleSave={handleSave}
                    setIsEditing={setIsEditing}
                  />
                </div>
              </TabsContent>

              <TabsContent value="addresses">
                <SavedAddresses />
              </TabsContent>

              <TabsContent value="security">
                <SecuritySettings />
              </TabsContent>

              <TabsContent value="preferences">
                <PreferencesSettings />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <AccountSummary profileData={profileData} />
          <RecentActivity />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;
