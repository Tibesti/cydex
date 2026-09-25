
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface ProfileData {
  name: string;
  email: string;
  phone: string;
}

interface ProfileFormProps {
  profileData: ProfileData;
  isEditing: boolean;
  handleInputChange: (field: string, value: string) => void;
  handleSave: () => void;
  setIsEditing: (editing: boolean) => void;
}

const ProfileForm = ({ 
  profileData, 
  isEditing, 
  handleInputChange, 
  handleSave, 
  setIsEditing 
}: ProfileFormProps) => {
  return (
    <div className="md:w-2/3 space-y-4">
      <div className="space-y-1">
        <Label htmlFor="name" className="text-red-600 font-medium">
          Full Name * (Required)
        </Label>
        <Input 
          id="name" 
          placeholder="Your Full Name (Required)" 
          value={profileData.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          disabled={!isEditing}
          className={!profileData.name ? 'border-red-500 bg-red-50' : ''}
        />
        {!profileData.name && (
          <p className="text-red-500 text-sm font-medium">
            ⚠️ Full name is required for order processing
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">Email Address</Label>
        <Input 
          id="email" 
          placeholder="Your Email" 
          value={profileData.email}
          onChange={(e) => handleInputChange('email', e.target.value)}
          disabled={!isEditing} 
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="phone" className="text-red-600 font-medium">
          Phone Number * (Required)
        </Label>
        <Input 
          id="phone" 
          placeholder="Your Phone Number (Required)"
          value={profileData.phone}
          onChange={(e) => handleInputChange('phone', e.target.value)}
          disabled={!isEditing}
          className={!profileData.phone ? 'border-red-500 bg-red-50' : ''}
        />
        {!profileData.phone && (
          <p className="text-red-500 text-sm font-medium">
            ⚠️ Phone number is required for order communication
          </p>
        )}
      </div>

      {isEditing && (
        <div className="flex justify-end mt-4">
          <Button variant="secondary" onClick={() => setIsEditing(false)} className="mr-2">
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      )}
    </div>
  );
};

export default ProfileForm;
