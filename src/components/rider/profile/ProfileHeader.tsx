
import React from 'react';
import { Separator } from '@/components/ui/separator';
import ProfileAvatar from './components/ProfileAvatar';
import ProfileInfo from './components/ProfileInfo';
import ProfileStatus from './components/ProfileStatus';
import ProfileRating from './components/ProfileRating';
import ProfileStats from './components/ProfileStats';
import ProfileDetails from './components/ProfileDetails';

interface ProfileHeaderProps {
  profile: any;
  editing: boolean;
  onAvatarUpdate?: (avatarUrl: string) => void;
}

const ProfileHeader = ({ profile, editing, onAvatarUpdate }: ProfileHeaderProps) => {
  if (!profile) return null;

  return (
    <div className="flex flex-col items-center space-y-3 sm:space-y-4">
      <ProfileAvatar 
        profile={profile} 
        editing={editing} 
        onAvatarUpdate={onAvatarUpdate} 
      />

      <ProfileInfo profile={profile} />
      
      <ProfileStatus profile={profile} />

      <ProfileRating profile={profile} />
      
      <Separator className="my-3 sm:my-4" />
      
      <ProfileStats profile={profile} />
      
      <Separator className="my-3 sm:my-4" />
      
      <ProfileDetails profile={profile} />
    </div>
  );
};

export default ProfileHeader;
