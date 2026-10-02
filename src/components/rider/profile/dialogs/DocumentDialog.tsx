
import React from 'react';
import { rejectOversizedFile } from '@/lib/uploads';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera } from 'lucide-react';

interface DocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: () => void;
}

const DocumentDialog = ({ open, onOpenChange, onUpload }: DocumentDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">National ID Verification</DialogTitle>
          <DialogDescription className="text-sm">
            Upload your National ID for verification
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 sm:space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="id-number" className="text-sm">National ID Number</Label>
            <Input id="id-number" className="text-sm h-8 sm:h-9" />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="expiry-date" className="text-sm">Expiry Date</Label>
            <Input id="expiry-date" type="date" className="text-sm h-8 sm:h-9" />
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm">Upload National ID (Front)</Label>
            <Input type="file" accept="image/*" className="text-sm h-8 sm:h-9" onChange={rejectOversizedFile} />
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm">Upload National ID (Back)</Label>
            <Input type="file" accept="image/*" className="text-sm h-8 sm:h-9" onChange={rejectOversizedFile} />
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm">Take Selfie for Verification</Label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 text-center">
              <Camera className="h-8 w-8 sm:h-10 sm:w-10 mx-auto text-gray-400 mb-2" />
              <p className="text-xs sm:text-sm text-gray-500">
                Click to take a photo or upload a recent selfie
              </p>
              <Button variant="outline" className="mt-3 sm:mt-4 text-xs sm:text-sm h-8 sm:h-9">
                <Camera className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                Take Photo
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="text-xs sm:text-sm h-8 sm:h-9">
            Cancel
          </Button>
          <Button onClick={onUpload} className="bg-primary hover:bg-primary-hover text-black text-xs sm:text-sm h-8 sm:h-9">
            Submit for Verification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentDialog;
