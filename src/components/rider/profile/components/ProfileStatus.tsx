
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { useRiderLocation } from '@/hooks/useRiderLocation';

interface ProfileStatusProps {
  profile: { isVerified: boolean };
}

// Online/offline follows the rider's live location; there's no manual toggle
const ProfileStatus = ({ profile }: ProfileStatusProps) => {
  const { isOnline } = useRiderLocation();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge className={isOnline ? "bg-green-500" : "bg-gray-500"} variant="default">
          {isOnline ? 'Online' : 'Offline'}
        </Badge>
        <Badge variant="outline" className={`text-xs ${profile.isVerified ? 'border-green-500 text-green-600' : 'border-red-500 text-red-600'}`}>
          {profile.isVerified ? 'Verified' : 'Not Verified'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">Online while your live location is on</p>
    </div>
  );
};

export default ProfileStatus;
