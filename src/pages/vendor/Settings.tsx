import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Bell,
  Shield,
  Lock,
  CreditCard,
  Store,
  Package,
  Settings as SettingsIcon,
  Camera,
  FileText,
  HelpCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { useVendorSettings } from '@/hooks/useVendorSettings';
import SingleAddressField from '@/components/address/SingleAddressField';

const VendorSettingsPage = () => {
  const { 
    settings, 
    profile, 
    loading, 
    saving,
    updateSettings,
    updateProfile,
    fetchVendorStats,
    fetchRecentActivity
  } = useVendorSettings();

  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState({
    name: '',
    email: '',
    phone: '',
    description: '',
    business_license: '',
    category: ''
  });
  const [vendorStats, setVendorStats] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [localSettings, setLocalSettings] = useState<any>(null);

  // Initialize data when profile/settings load
  useEffect(() => {
    if (profile && settings) {
      setProfileData({
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        description: settings.description || '',
        business_license: settings.business_license || '',
        category: settings.category || ''
      });
      setLocalSettings(settings);
    }
  }, [profile, settings]);

  // Load additional data
  useEffect(() => {
    const loadAdditionalData = async () => {
      const [stats, activity] = await Promise.all([
        fetchVendorStats(),
        fetchRecentActivity()
      ]);
      setVendorStats(stats);
      setRecentActivity(activity);
    };

    if (profile?.id) {
      loadAdditionalData();
    }
  }, [profile?.id, fetchVendorStats, fetchRecentActivity]);

  const handleSave = async () => {
    if (!profile || !settings) return;
    
    try {
      // Update profile data (the store address saves on its own via the address picker)
      await updateProfile({
        name: profileData.name,
        phone: profileData.phone
      });

      // Update settings data
      await updateSettings({
        description: profileData.description,
        business_license: profileData.business_license,
        category: profileData.category
      });

      setIsEditing(false);
    } catch (error) {
      // Error handled in hooks
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleNotificationChange = async (key: string, value: boolean) => {
    if (!localSettings) return;
    
    const updatedPreferences = {
      ...localSettings.notification_preferences,
      [key]: value
    };
    
    try {
      await updateSettings({
        notification_preferences: updatedPreferences
      });
      setLocalSettings(prev => ({
        ...prev,
        notification_preferences: updatedPreferences
      }));
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleSecurityChange = async (key: string, value: boolean | number) => {
    if (!localSettings) return;
    
    const updatedSettings = {
      ...localSettings.security_settings,
      [key]: value
    };
    
    try {
      await updateSettings({
        security_settings: updatedSettings
      });
      setLocalSettings(prev => ({
        ...prev,
        security_settings: updatedSettings
      }));
    } catch (error) {
      // Error handled in hook
    }
  };

  if (loading || !profile || !settings) {
    return (
      <DashboardLayout userRole="VENDOR">
        <div className="p-3 sm:p-4 md:p-6 max-w-full mx-auto space-y-4 sm:space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-64 bg-gray-200 rounded"></div>
              <div className="h-64 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="VENDOR">
      <div className="p-3 sm:p-4 md:p-6 max-w-full mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>
            <p className="text-sm sm:text-base text-gray-600">
              Manage your store settings and profile information
            </p>
          </div>
          <Button 
            onClick={() => setIsEditing(true)} 
            disabled={isEditing || saving}
            className="w-full sm:w-auto text-xs sm:text-sm"
          >
            {saving ? (
              <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
            ) : (
              <SettingsIcon className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            )}
            Edit Profile
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg">Store Information</CardTitle>
            <CardDescription className="text-sm">View and update your store details</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="account" className="w-full">
              <TabsList className="mb-3 sm:mb-4 w-full grid grid-cols-3 sm:w-auto sm:flex">
                <TabsTrigger value="account" className="text-xs sm:text-sm">Account</TabsTrigger>
                <TabsTrigger value="security" className="text-xs sm:text-sm">Security</TabsTrigger>
                <TabsTrigger value="preferences" className="text-xs sm:text-sm">Preferences</TabsTrigger>
              </TabsList>

              <TabsContent value="account" className="mt-3 sm:mt-4">
                <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
                  <div className="lg:w-1/3 flex flex-col items-center">
                    <Avatar className="h-24 w-24 sm:h-32 sm:w-32">
                      <AvatarImage src={profile.avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${profile.name}`} />
                      <AvatarFallback className="text-lg sm:text-xl">
                        {profile.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <Button variant="ghost" size="sm" className="mt-2 text-xs sm:text-sm" disabled>
                      <Camera className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                      Change Logo
                    </Button>
                    {profile.verified && (
                      <Badge className="mt-2 bg-green-100 text-green-800">Verified</Badge>
                    )}
                  </div>

                  <div className="lg:w-2/3 space-y-3 sm:space-y-4">
                    <div className="space-y-1 sm:space-y-2">
                      <Label htmlFor="name" className="text-red-600 font-medium text-sm sm:text-base">Store Name * (Required)</Label>
                      <Input
                        id="name"
                        placeholder="Your Store Name (Required)"
                        value={profileData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        disabled={!isEditing}
                        className={`text-sm sm:text-base ${!profileData.name ? 'border-red-500 bg-red-50' : ''}`}
                      />
                      {!profileData.name && (
                        <p className="text-red-500 text-sm font-medium">
                          ⚠️ Store name is required for order management
                        </p>
                      )}
                    </div>
                    
                    <FormField
                      id="email"
                      label="Email Address"
                      placeholder="Your Email"
                      value={profileData.email}
                      onChange={(value) => handleInputChange('email', value)}
                      disabled={true} // Email should not be editable
                    />
                    
                    <div className="space-y-1 sm:space-y-2">
                      <Label htmlFor="phone" className="text-red-600 font-medium text-sm sm:text-base">Phone Number * (Required)</Label>
                      <Input
                        id="phone"
                        placeholder="Your Phone Number (Required)"
                        value={profileData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        disabled={!isEditing}
                        className={`text-sm sm:text-base ${!profileData.phone ? 'border-red-500 bg-red-50' : ''}`}
                      />
                      {!profileData.phone && (
                        <p className="text-red-500 text-sm font-medium">
                          ⚠️ Phone number is required for order communication
                        </p>
                      )}
                    </div>
                    
                    <SingleAddressField
                      label="Store address"
                      addressLabel="Store"
                      pickerTitle="Store location"
                      pickerDescription="Search for your store, then drag the map so the pin sits exactly where riders should pick up orders."
                      emptyText="No store location set. Riders need it to find you."
                    />
                    
                    <FormField
                      id="description"
                      label="Description"
                      placeholder="Your Store Description"
                      value={profileData.description}
                      onChange={(value) => handleInputChange('description', value)}
                      disabled={!isEditing}
                      isTextarea
                    />
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">
                        Business License
                      </label>
                      <div className="relative">
                        <Input
                          placeholder="Your Business License"
                          value=""
                          disabled
                          className="bg-gray-50 text-gray-400"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                            Coming Soon...
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={profileData.category}
                        onChange={(e) => handleInputChange('category', e.target.value)}
                        disabled={!isEditing}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-50 disabled:text-gray-500"
                      >
                        <option value="">Select a category</option>
                        <option value="restaurant">Restaurant</option>
                        <option value="grocery">Grocery Store</option>
                        <option value="pharmacy">Pharmacy</option>
                        <option value="electronics">Electronics</option>
                        <option value="clothing">Clothing & Fashion</option>
                        <option value="books">Books & Stationery</option>
                        <option value="home-garden">Home & Garden</option>
                        <option value="health-beauty">Health & Beauty</option>
                        <option value="sports">Sports & Outdoors</option>
                        <option value="toys">Toys & Games</option>
                        <option value="automotive">Automotive</option>
                        <option value="other">Other</option>
                      </select>
                      {!profileData.category && (
                        <p className="text-sm text-red-500">Please select a category to continue</p>
                      )}
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-0 mt-4 sm:mt-6">
                    <Button 
                      variant="secondary" 
                      onClick={() => setIsEditing(false)} 
                      className="w-full sm:w-auto sm:mr-2 text-xs sm:text-sm"
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSave}
                      className="w-full sm:w-auto text-xs sm:text-sm"
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="security" className="mt-3 sm:mt-4">
                <div className="space-y-3 sm:space-y-4">
                  <SecurityCard
                    title="Password"
                    description="Change your password to keep your account secure."
                    action={<Button className="text-xs sm:text-sm" disabled>Change Password</Button>}
                  />

                  <SecurityCard
                    title="Two-Factor Authentication"
                    description="Add an extra layer of security to your account."
                    action={
                      <div className="flex items-center justify-between w-full">
                        <span className="text-sm sm:text-base">Enable Two-Factor Authentication</span>
                        <Switch 
                          id="2fa" 
                          checked={localSettings?.security_settings?.two_factor_enabled || false}
                          onCheckedChange={(checked) => handleSecurityChange('two_factor_enabled', checked)}
                        />
                      </div>
                    }
                  />

                  <SecurityCard
                    title="Session Timeout"
                    description="Automatically log out after period of inactivity."
                    action={
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={localSettings?.security_settings?.session_timeout / 60 || 60}
                          onChange={(e) => handleSecurityChange('session_timeout', parseInt(e.target.value) * 60)}
                          className="w-20"
                          min="5"
                          max="480"
                        />
                        <span className="text-sm">minutes</span>
                      </div>
                    }
                  />
                </div>
              </TabsContent>

              <TabsContent value="preferences" className="mt-3 sm:mt-4">
                <div className="space-y-3 sm:space-y-4">
                  <PreferenceCard
                    title="Notification Preferences"
                    description="Manage your notification settings."
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm sm:text-base">Email Notifications</span>
                        <Switch 
                          id="email-notifications"
                          checked={localSettings?.notification_preferences?.email || false}
                          onCheckedChange={(checked) => handleNotificationChange('email', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm sm:text-base">Push Notifications</span>
                        <Switch 
                          id="push-notifications"
                          checked={localSettings?.notification_preferences?.push || false}
                          onCheckedChange={(checked) => handleNotificationChange('push', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm sm:text-base">SMS Notifications</span>
                        <Switch 
                          id="sms-notifications"
                          checked={localSettings?.notification_preferences?.sms || false}
                          onCheckedChange={(checked) => handleNotificationChange('sms', checked)}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm sm:text-base">Marketing Emails</span>
                        <Switch 
                          id="marketing-notifications"
                          checked={localSettings?.notification_preferences?.marketing || false}
                          onCheckedChange={(checked) => handleNotificationChange('marketing', checked)}
                        />
                      </div>
                    </div>
                  </PreferenceCard>

                  <PreferenceCard
                    title="Appearance"
                    description="Customize the look and feel of your account."
                  >
                    <Button className="text-xs sm:text-sm" disabled>Change Theme</Button>
                  </PreferenceCard>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-base sm:text-lg">Store Summary</CardTitle>
              <CardDescription className="text-sm">Your store activity at a glance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              {vendorStats ? (
                <>
                  <SummaryItem
                    icon={<Store className="h-5 w-5 sm:h-6 sm:w-6 text-green-500" />}
                    title={`${vendorStats.productCount} Products`}
                    description="Total active products in your store"
                  />
                  <SummaryItem
                    icon={<Package className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />}
                    title={`${vendorStats.orderCount} Orders`}
                    description="Orders completed this month"
                  />
                  <SummaryItem
                    icon={<CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500" />}
                    title={`₦${vendorStats.totalRevenue.toLocaleString()} Revenue`}
                    description="Total revenue this month"
                  />
                </>
              ) : (
                <div className="animate-pulse space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <div className="h-6 w-6 bg-gray-200 rounded"></div>
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-gray-200 rounded w-24"></div>
                        <div className="h-3 bg-gray-200 rounded w-32"></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-base sm:text-lg">Recent Activity</CardTitle>
              <CardDescription className="text-sm">Your latest actions and updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity, index) => (
                  <ActivityItem
                    key={index}
                    icon={
                      activity.type === 'order' ? (
                        <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" />
                      ) : (
                        <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" />
                      )
                    }
                    title={activity.title}
                    description={activity.description}
                    timestamp={activity.timestamp}
                  />
                ))
              ) : (
                <div className="text-center py-4">
                  <HelpCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

const FormField = ({ 
  id, 
  label, 
  placeholder, 
  value, 
  onChange, 
  disabled, 
  isTextarea = false 
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  isTextarea?: boolean;
}) => (
  <div className="space-y-1 sm:space-y-2">
    <Label htmlFor={id} className="text-sm sm:text-base">{label}</Label>
    {isTextarea ? (
      <Textarea
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="text-sm sm:text-base"
      />
    ) : (
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="text-sm sm:text-base"
      />
    )}
  </div>
);

const SecurityCard = ({ title, description, action }: { title: string; description: string; action: React.ReactNode }) => (
  <Card className="shadow-none">
    <CardHeader className="pb-2 sm:pb-4">
      <CardTitle className="text-sm sm:text-base">{title}</CardTitle>
      <CardDescription className="text-xs sm:text-sm">{description}</CardDescription>
    </CardHeader>
    <CardContent>
      {action}
    </CardContent>
  </Card>
);

const PreferenceCard = ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
  <Card className="shadow-none">
    <CardHeader className="pb-2 sm:pb-4">
      <CardTitle className="text-sm sm:text-base">{title}</CardTitle>
      <CardDescription className="text-xs sm:text-sm">{description}</CardDescription>
    </CardHeader>
    <CardContent>
      {children}
    </CardContent>
  </Card>
);

const SummaryItem = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="flex items-center space-x-3 sm:space-x-4">
    {icon}
    <div>
      <h3 className="text-base sm:text-lg font-medium">{title}</h3>
      <p className="text-xs sm:text-sm text-gray-500">{description}</p>
    </div>
  </div>
);

const ActivityItem = ({ icon, title, description, timestamp }: { icon: React.ReactNode; title: string; description: string; timestamp: string }) => (
  <div className="flex items-start space-x-3 sm:space-x-4">
    <div className="flex-shrink-0 mt-0.5">
      {icon}
    </div>
    <div className="min-w-0 flex-1">
      <h3 className="text-sm sm:text-base font-medium">{title}</h3>
      <p className="text-xs sm:text-sm text-gray-500 truncate">{description}</p>
      <p className="text-xs text-gray-400 mt-1">
        {new Date(timestamp).toLocaleString()}
      </p>
    </div>
  </div>
);

export default VendorSettingsPage;