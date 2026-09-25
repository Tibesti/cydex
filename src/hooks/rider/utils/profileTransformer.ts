
import { RiderProfileData, VehicleInfo, DocumentInfo, BankDetail } from '../types';

export const transformProfileData = (
  profileData: any,
  riderData: any,
  deliveriesData: any[],
  bankDetailsData: BankDetail[]
): RiderProfileData | null => {
  if (!profileData) {
    console.error('[ProfileTransformer] No profile data provided');
    return null;
  }

  console.log('[ProfileTransformer] Transforming profile data:', {
    profileData,
    riderData,
    deliveriesData,
    bankDetailsData
  });

  // Calculate stats from deliveries
  const completedDeliveries = deliveriesData.filter(d => d.status === 'delivered');
  const totalCarbonSaved = deliveriesData.reduce((sum, d) => sum + (d.carbon_saved || 0), 0);
  const totalDistance = deliveriesData.reduce((sum, d) => sum + (d.actual_distance || 0), 0);

  // Create default vehicle info
  const vehicle: VehicleInfo = {
    type: riderData?.vehicle_type || 'bicycle',
    model: 'Not specified',
    year: 'Not specified',
    color: 'Not specified',
    licensePlate: riderData?.license_number || 'Not provided',
    registration: riderData?.vehicle_registration || 'Not provided'
  };

  // Create default document info
  const documents: DocumentInfo = {
    idCard: {
      verified: false,
      expiryDate: 'Not provided',
      documentUrl: undefined
    },
    driverLicense: {
      verified: false,
      expiryDate: 'Not provided',
      documentUrl: undefined
    },
    insurance: {
      verified: false,
      expiryDate: 'Not provided',
      documentUrl: undefined
    }
  };

  // Format join date
  const joinDate = profileData.created_at 
    ? new Date(profileData.created_at).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short' 
      })
    : 'Unknown';

  const transformedProfile: RiderProfileData = {
    id: profileData.id,
    name: profileData.name || 'Unknown',
    email: profileData.email || 'No email',
    phone: profileData.phone || 'No phone',
    avatar: profileData.avatar || `https://api.dicebear.com/7.x/personas/svg?seed=${profileData.email}`,
    joinDate,
    isOnline: riderData?.rider_status === 'available',
    isVerified: riderData?.is_verified || false,
    verificationStatus: riderData?.verification_status || 'pending',
    vehicle,
    documents,
    bankDetails: bankDetailsData || [],
    preferences: {
      deliveryPreferences: {
        maxDistance: riderData?.delivery_preferences?.max_distance || 15,
        preferredZones: riderData?.delivery_preferences?.preferred_zones || [],
        availableDays: riderData?.delivery_preferences?.available_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      },
      notifications: {
        app: riderData?.notification_preferences?.app !== undefined ? riderData.notification_preferences.app : true,
        email: riderData?.notification_preferences?.email !== undefined ? riderData.notification_preferences.email : true,
        sms: riderData?.notification_preferences?.sms !== undefined ? riderData.notification_preferences.sms : false,
        marketing: riderData?.notification_preferences?.marketing !== undefined ? riderData.notification_preferences.marketing : false
      }
    },
    stats: {
      rating: riderData?.rating || 0,
      reviews: 0, // This would need to be calculated from reviews table
      completedDeliveries: completedDeliveries.length,
      totalDistance: Math.round(totalDistance * 100) / 100,
      carbonSaved: Math.round(totalCarbonSaved * 100) / 100,
      sustainabilityScore: Math.min(100, Math.round((totalCarbonSaved / 10) * 100) / 100)
    }
  };

  console.log('[ProfileTransformer] Transformed profile:', transformedProfile);
  return transformedProfile;
};
