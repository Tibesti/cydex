import React from 'react';
import { Calendar, MapPin } from 'lucide-react';
import { useAddresses } from '@/hooks/useAddresses';
import { addressHeadline } from '@/lib/address';

interface ProfileDetailsProps {
  profile: { joinDate: string };
}

const ProfileDetails = ({ profile }: ProfileDetailsProps) => {
  const { defaultAddress } = useAddresses();

  return (
    <div className="w-full space-y-2 sm:space-y-3">
      <div className="flex items-center">
        <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500" />
        <span className="ml-2 text-xs sm:text-sm">Joined {profile.joinDate}</span>
      </div>
      <div className="flex items-start">
        <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500 mt-1" />
        <span className="ml-2 text-xs sm:text-sm">
          {defaultAddress ? addressHeadline(defaultAddress) : 'No address set'}
        </span>
      </div>
    </div>
  );
};

export default ProfileDetails;
