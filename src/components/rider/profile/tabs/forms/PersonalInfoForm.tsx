
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { User, Save } from 'lucide-react';
import { useRiderLocation } from '@/hooks/useRiderLocation';
import SingleAddressField from '@/components/address/SingleAddressField';

interface PersonalInfoFormProps {
  formData: {
    name: string;
    email: string;
    phone: string;
  };
  editing: boolean;
  onInputChange: (field: string, value: string) => void;
  onSave: () => Promise<void>;
}

const PersonalInfoForm = ({ formData, editing, onInputChange, onSave }: PersonalInfoFormProps) => {
  const { permission, position, label } = useRiderLocation();
  const liveLocation =
    permission !== 'granted' ? 'Location is off' : !position ? 'Finding your location…' : label ? `Near ${label}` : 'Location on';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center">
          <User className="h-5 w-5 mr-2" />
          Personal Information
        </CardTitle>
        <CardDescription>Update your basic profile information</CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-red-600 font-medium">Full Name * (Required)</Label>
            <Input 
              id="name" 
              placeholder="Your Full Name (Required)"
              value={formData.name}
              onChange={(e) => onInputChange('name', e.target.value)}
              disabled={!editing}
              className={`${!editing ? "bg-gray-50" : ""} ${!formData.name ? 'border-red-500 bg-red-50' : ''}`}
            />
            {!formData.name && (
              <p className="text-red-500 text-sm font-medium">
                ⚠️ Full name is required for delivery coordination
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              type="email" 
              value={formData.email}
              onChange={(e) => onInputChange('email', e.target.value)}
              disabled={!editing}
              className={!editing ? "bg-gray-50" : ""} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-red-600 font-medium">Phone Number * (Required)</Label>
            <Input 
              id="phone" 
              placeholder="Your Phone Number (Required)"
              value={formData.phone}
              onChange={(e) => onInputChange('phone', e.target.value)}
              disabled={!editing}
              className={`${!editing ? "bg-gray-50" : ""} ${!formData.phone ? 'border-red-500 bg-red-50' : ''}`}
            />
            {!formData.phone && (
              <p className="text-red-500 text-sm font-medium">
                ⚠️ Phone number is required for delivery coordination
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            {/* Saved address; saves on its own through the address picker */}
            <SingleAddressField
              label="Address"
              addressLabel="Home"
              pickerTitle="Your address"
              pickerDescription="Search for your address, then drag the map so the pin sits exactly on it."
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Current location</Label>
            {/* Live location, separate from the saved address (used for the 5 km order radius) */}
            <p className="rounded-md border p-3 text-sm">
              {liveLocation}
              <span className="block text-xs text-muted-foreground">Updated automatically while you use the app</span>
            </p>
          </div>
        </div>
        
        {editing && (
          <div className="mt-6 flex justify-end">
            <Button onClick={onSave} className="bg-primary hover:bg-primary-hover text-black">
              <Save className="h-4 w-4 mr-2" />
              Save Personal Info
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PersonalInfoForm;
