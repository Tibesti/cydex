import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import InstallInstructions from './InstallInstructions';

// "Download app": the install steps in a modal (landing page section and footer link)
const DownloadAppDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Get the Cydex app</DialogTitle>
        <DialogDescription>Add Cydex to your phone or computer to open it like any app and get order alerts.</DialogDescription>
      </DialogHeader>
      <InstallInstructions />
    </DialogContent>
  </Dialog>
);

export default DownloadAppDialog;
