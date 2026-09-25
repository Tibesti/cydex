import { useState } from 'react';
import { MapPin, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAddresses } from '@/hooks/useAddresses';
import { addressHeadline } from '@/lib/address';
import { AddressPickerDialog } from './AddressPickerDialog';

interface SingleAddressFieldProps {
  // Field label, e.g. "Store address"
  label: string;
  // Saved label for the address, e.g. "Store" or "Home"
  addressLabel: string;
  pickerTitle: string;
  pickerDescription?: string;
  emptyText?: string;
}

// Profile field for roles with exactly one address (vendor store, rider).
// Saves straight away through the address picker; no profile "Save" needed.
const SingleAddressField = ({
  label,
  addressLabel,
  pickerTitle,
  pickerDescription,
  emptyText = 'No address set yet',
}: SingleAddressFieldProps) => {
  const { defaultAddress: address, isLoading } = useAddresses();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-1 sm:space-y-2">
      <Label className="text-sm sm:text-base">{label}</Label>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border p-3">
        <MapPin className="hidden sm:block h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-sm">
          {isLoading ? (
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          ) : address ? (
            <>
              <p className="font-medium">{addressHeadline(address)}</p>
              <p className="text-muted-foreground">{address.formatted_address}</p>
              {address.directions && (
                <p className="mt-1 text-xs text-muted-foreground">Directions: {address.directions}</p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">{emptyText}</p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={address ? 'outline' : 'default'}
          onClick={() => setPickerOpen(true)}
          disabled={isLoading}
        >
          {address ? <Pencil className="mr-1 h-4 w-4" /> : <MapPin className="mr-1 h-4 w-4" />}
          {address ? 'Change' : 'Set address'}
        </Button>
      </div>

      <AddressPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        address={address}
        fixedLabel={addressLabel}
        title={pickerTitle}
        description={pickerDescription}
      />
    </div>
  );
};

export default SingleAddressField;
