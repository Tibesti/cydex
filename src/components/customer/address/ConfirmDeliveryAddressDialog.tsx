import React, { useEffect, useState } from 'react';
import { Loader2, MapPin, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Address, useAddresses } from '@/hooks/useAddresses';
import { addressHeadline } from '@/lib/address';
import { AddressPickerDialog } from '@/components/address/AddressPickerDialog';
import { AddressLabelIcon } from '@/components/address/AddressLabelIcon';
import { CartLine, useOrderQuote } from '@/hooks/useOrderQuote';
import { PriceBreakdown } from '@/components/customer/PriceBreakdown';
import { quoteProblem } from '@/lib/pricing';

interface ConfirmDeliveryAddressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (address: Address) => void;
  confirming?: boolean;
  vendorId: string | null;
  // Product ids and quantities; prices come from the database
  items: CartLine[];
  // Shown until the database quote arrives
  cartSubtotal: number;
}

// Checkout step: confirm the default address or pick another saved one for
// this order. Choosing a different address here doesn't change the default.
export const ConfirmDeliveryAddressDialog: React.FC<ConfirmDeliveryAddressDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  confirming = false,
  vendorId,
  items,
  cartSubtotal,
}) => {
  const { addresses, defaultAddress, isLoading } = useAddresses();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Preselect the default address each time checkout opens
  useEffect(() => {
    if (open) setSelectedId(defaultAddress?.id ?? null);
  }, [open, defaultAddress?.id]);

  const selected = addresses.find((a) => a.id === selectedId) ?? null;
  const { quote, isLoading: quoteLoading } = useOrderQuote(vendorId, selected?.id, items);
  const deliverable = quote?.status === 'ok';
  const problem = selected ? quoteProblem(quote?.status) : null;

  return (
    <>
      <Dialog open={open && !pickerOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Deliver to
            </DialogTitle>
            <DialogDescription>
              {addresses.length > 0
                ? 'Confirm your delivery address or choose another saved one.'
                : 'Add a delivery address to continue.'}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="animate-pulse h-20 rounded bg-muted" />
          ) : (
            <RadioGroup value={selectedId ?? ''} onValueChange={setSelectedId} className="space-y-2">
              {addresses.map((address) => (
                <label
                  key={address.id}
                  htmlFor={`deliver-to-${address.id}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                    address.id === selectedId ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <RadioGroupItem id={`deliver-to-${address.id}`} value={address.id} className="mt-1" />
                  <AddressLabelIcon label={address.label} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{address.label}</span>
                      {address.is_default && <Badge variant="secondary">Default</Badge>}
                    </div>
                    <p>{addressHeadline(address)}</p>
                    <p className="text-muted-foreground">{address.formatted_address}</p>
                    {address.directions && (
                      <p className="mt-1 text-xs text-muted-foreground">Directions: {address.directions}</p>
                    )}
                  </div>
                </label>
              ))}
            </RadioGroup>
          )}

          <Button variant="outline" onClick={() => setPickerOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {addresses.length > 0 ? 'Add another address' : 'Add an address'}
          </Button>

          {selected && (
            <div className="space-y-2 rounded-md border p-3">
              <PriceBreakdown
                subtotal={quote?.subtotal ?? cartSubtotal}
                serviceCharge={quote?.service_charge ?? null}
                deliveryFee={deliverable ? quote.delivery_fee : null}
                distanceKm={deliverable ? quote.distance_km : null}
                total={deliverable ? quote.total_amount : null}
                loading={quoteLoading}
              />
              {problem && <p className="text-xs text-destructive">{problem}</p>}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => selected && onConfirm(selected)} disabled={!selected || !deliverable || confirming}>
              {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deliver here
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddressPickerDialog
        open={open && pickerOpen}
        onOpenChange={setPickerOpen}
        onSaved={(address) => setSelectedId(address.id)}
      />
    </>
  );
};
