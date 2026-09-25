
export interface VehicleInfo {
  type: string;
  model: string;
  year: string;
  color: string;
  licensePlate: string;
  registration: string;
}

export interface DocumentInfo {
  idCard: {
    verified: boolean;
    expiryDate: string;
    documentUrl?: string;
  };
  driverLicense: {
    verified: boolean;
    expiryDate: string;
    documentUrl?: string;
  };
  insurance: {
    verified: boolean;
    expiryDate: string;
    documentUrl?: string;
  };
}

export interface BankDetail {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  bvn?: string;
  is_verified: boolean;
  is_default: boolean;
}

export interface ReviewData {
  id: string;
  customer_name: string;
  rating: number;
  comment: string;
  delivery_rating: number;
  communication_rating: number;
  created_at: string;
}

export interface AchievementData {
  id: string;
  title: string;
  description: string;
  achievement_type: string;
  progress: number;
  target: number;
  earned_date?: string;
  icon: string;
}

export interface RiderProfileData {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  joinDate: string;
  isOnline: boolean;
  isVerified: boolean;
  verificationStatus: string;
  vehicle: VehicleInfo;
  documents: DocumentInfo;
  bankDetails: BankDetail[];
  preferences: {
    deliveryPreferences: {
      maxDistance: number;
      preferredZones: string[];
      availableDays: string[];
    };
    notifications: {
      app: boolean;
      email: boolean;
      sms: boolean;
      marketing: boolean;
    };
  };
  stats: {
    rating: number;
    reviews: number;
    completedDeliveries: number;
    totalDistance: number;
    carbonSaved: number;
    sustainabilityScore: number;
  };
}
