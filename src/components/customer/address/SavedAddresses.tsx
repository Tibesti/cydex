import { useState } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Address, useAddresses } from '@/hooks/useAddresses';
import { addressHeadline, errorMessage } from '@/lib/address';
import { AddressPickerDialog } from '@/components/address/AddressPickerDialog';
import { AddressLabelIcon } from '@/components/address/AddressLabelIcon';

// Profile tab: the customer's saved addresses. The default one is used for delivery.
const SavedAddresses = () => {
  const { addresses, isLoading, setDefaultAddress, deleteAddress } = useAddresses();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);

  const openPicker = (address: Address | null) => {
    setEditing(address);
    setPickerOpen(true);
  };

  const handleSetDefault = async (address: Address) => {
    try {
      await setDefaultAddress(address.id);
      toast.success(`${address.label} is now your default address`);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not change your default address'));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteAddress(deleting.id);
      toast.success('Address removed');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not remove address'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Your default address is used for delivery. You can pick a different one at checkout.
        </p>
        <Button size="sm" onClick={() => openPicker(null)} className="w-full sm:w-auto">
          <Plus className="mr-1 h-4 w-4" />
          Add address
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="animate-pulse h-20 rounded bg-muted" />
          <div className="animate-pulse h-20 rounded bg-muted" />
        </div>
      ) : addresses.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          <MapPin className="mx-auto mb-2 h-6 w-6" />
          You haven't saved any addresses yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className={`rounded-md border p-3 sm:p-4 ${address.is_default ? 'border-primary bg-primary/5' : ''}`}
            >
              <div className="flex items-start gap-3">
                <AddressLabelIcon label={address.label} className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{address.label}</span>
                    {address.is_default && <Badge>Default</Badge>}
                  </div>
                  <p className="text-sm">{addressHeadline(address)}</p>
                  <p className="text-sm text-muted-foreground">{address.formatted_address}</p>
                  {address.directions && (
                    <p className="mt-1 text-xs text-muted-foreground">Directions: {address.directions}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 sm:justify-end">
                {!address.is_default && (
                  <Button size="sm" variant="outline" onClick={() => handleSetDefault(address)}>
                    Set as default
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => openPicker(address)}>
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(address)}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddressPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} address={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this address?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.is_default
                ? 'This is your default address. Your most recently added address will become the new default.'
                : 'You can add it again at any time.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SavedAddresses;
