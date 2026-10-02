
import React, { useState } from 'react';
import { checkUploadSize } from '@/lib/uploads';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ProfileAvatarProps {
  profile: any;
  editing: boolean;
  onAvatarUpdate?: (avatarUrl: string) => void;
}

const ProfileAvatar = ({ profile, editing, onAvatarUpdate }: ProfileAvatarProps) => {
  const [uploading, setUploading] = useState(false);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!checkUploadSize(file)) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setUploading(true);
    
    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`;
      
      // For now, we'll use a simple data URL approach
      // In a production app, you'd upload to Supabase Storage
      const reader = new FileReader();
      reader.onload = async (e) => {
        const avatarUrl = e.target?.result as string;
        
        // Update profile with new avatar
        const { error } = await supabase
          .from('profiles')
          .update({ avatar: avatarUrl })
          .eq('id', profile.id);

        if (error) {
          console.error('Error updating avatar:', error);
          toast.error('Failed to update profile photo');
        } else {
          toast.success('Profile photo updated successfully');
          if (onAvatarUpdate) {
            onAvatarUpdate(avatarUrl);
          }
        }
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload profile photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative">
      <Avatar className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24">
        {profile.avatar ? (
          <AvatarImage src={profile.avatar} alt={profile.name} />
        ) : (
          <AvatarFallback className="text-lg sm:text-xl bg-primary-light text-primary">
            {profile.name.split(' ').map((n: string) => n[0]).join('')}
          </AvatarFallback>
        )}
      </Avatar>
      {editing && (
        <>
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            style={{ display: 'none' }}
            id="avatar-upload"
            disabled={uploading}
          />
          <label htmlFor="avatar-upload">
            <Button 
              size="sm" 
              variant="secondary" 
              className="absolute -bottom-1 -right-1 rounded-full h-6 w-6 sm:h-8 sm:w-8 p-0 cursor-pointer"
              disabled={uploading}
              asChild
            >
              <span>
                <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
              </span>
            </Button>
          </label>
        </>
      )}
      {uploading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        </div>
      )}
    </div>
  );
};

export default ProfileAvatar;
