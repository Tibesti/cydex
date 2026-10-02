
import React, { useState } from 'react';
import { rejectOversizedFile } from '@/lib/uploads';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface VehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: any;
  onUpdate: (vehicleData: any) => void;
}

const VehicleDialog = ({ open, onOpenChange, vehicle, onUpdate }: VehicleDialogProps) => {
  const [formData, setFormData] = useState({
    type: vehicle?.type || 'walking',
    model: vehicle?.model || '',
    year: vehicle?.year || '',
    color: vehicle?.color || '',
    licensePlate: vehicle?.licensePlate || '',
    registration: vehicle?.registration || ''
  });

  const handleSubmit = () => {
    onUpdate(formData);
    onOpenChange(false);
  };

  const vehicleRequiresDetails = formData.type !== 'walking';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">Update Vehicle Information</DialogTitle>
          <DialogDescription className="text-sm">
            Update your vehicle details for delivery operations
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 sm:space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="vehicle-type" className="text-sm">Vehicle Type</Label>
            <select 
              id="vehicle-type" 
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm h-8 sm:h-9"
            >
              <option value="walking">Walking</option>
              <option value="bicycle">Bicycle</option>
              <option value="electric_bike" disabled className="text-gray-400">
                Electric Bike (Coming Soon)
              </option>
            </select>
          </div>

          {vehicleRequiresDetails && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label htmlFor="vehicle-model" className="text-sm">Model</Label>
                  <Input 
                    id="vehicle-model" 
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="text-sm h-8 sm:h-9" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehicle-year" className="text-sm">Year</Label>
                  <Input 
                    id="vehicle-year" 
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    className="text-sm h-8 sm:h-9" 
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="vehicle-color" className="text-sm">Color</Label>
                <Input 
                  id="vehicle-color" 
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="text-sm h-8 sm:h-9" 
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="vehicle-docs" className="text-sm">Upload Vehicle Documentation</Label>
                <Input id="vehicle-docs" type="file" className="text-sm h-8 sm:h-9" onChange={rejectOversizedFile} />
                <p className="text-xs text-gray-500">Upload registration documents if applicable</p>
              </div>
            </>
          )}
        </div>
        <DialogFooter className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs sm:text-sm h-8 sm:h-9">
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="bg-primary hover:bg-primary-hover text-black text-xs sm:text-sm h-8 sm:h-9">
            Update Vehicle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VehicleDialog;
