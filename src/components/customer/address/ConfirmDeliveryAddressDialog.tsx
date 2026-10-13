import React, { useEffect, useState } from 'react';
import { Clock, Loader2, MapPin, Plus } from 'lucide-react';
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
import { formatNaira, quoteProblem } from '@/lib/pricing';
import CouponField from '@/components/delivery/CouponField';
import CheckoutOffers from '@/components/promotions/CheckoutOffers';
import DeliveryModeSelect from '@/components/delivery/DeliveryModeSelect';
import { etaText, NO_RIDERS_MESSAGE } from '@/lib/deliveryModes';

export interface CheckoutChoices {
  /** Preferred delivery mode (a vehicle type key) */
  vehicleType: string | null;
  couponCode: string | null;
}

interface ConfirmDeliveryAddressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (address: Address, choices: CheckoutChoices) => void;
  confirming?: boolean;
  vendorId: string | null;
  // Product ids and quantities; prices come from the database
  items: CartLine[];
  // Shown until the database quote arrives
  cartSubtotal: number;
}

// Checkout step, before payment: confirm the default address or pick another
// saved one for this order (that doesn't change the default), choose a
// preferred delivery mode, enter a coupon, and see the price, the estimated
// delivery time and how it will be paid (wallet first, card for the rest).
// Ordering is blocked here when the vendor is closed or no rider is free.
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
  const [mode, setMode] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<string | null>(null);

  // Preselect the default address each time checkout opens
  useEffect(() => {
    if (open) setSelectedId(defaultAddress?.id ?? null);
  }, [open, defaultAddress?.id]);

  useEffect(() => {
    if (!open) return;
    setMode(null);
    setCoupon(null);
  }, [open]);

  const selected = addresses.find((a) => a.id === selectedId) ?? null;
  const { quote, isLoading: quoteLoading, isFetching } = useOrderQuote(open ? vendorId : null, selected?.id, items, mode, coupon);
  const deliverable = quote?.status === 'ok';
  const problem = selected ? quoteProblem(quote?.status) : null;
  const closed = deliverable && !quote.vendor_open;
  const noRiders = deliverable && !closed && !quote.riders_available;
  const canOrder = deliverable && !closed && !noRiders;
  const couponApplied = !!coupon && quote?.coupon_status === 'applied';

  const payLabel = !canOrder || quote.total_amount === null
    ? 'Continue'
    : quote.card_amount > 0
      ? `Continue to pay ${formatNaira(quote.card_amount)}`
      : `Pay ${formatNaira(quote.total_amount)} from wallet`;

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

          {closed && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              This vendor is closed right now, so they can't take your order. Check their opening hours and try again.
            </div>
          )}

          {noRiders && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {NO_RIDERS_MESSAGE}
            </div>
          )}

          {canOrder && (
            <>
              <DeliveryModeSelect modes={quote.modes} value={quote.vehicle_type} onChange={setMode} disabled={confirming} />

              {!!quote.eta_min && (
                <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Estimated delivery time: {etaText(quote.eta_min, quote.eta_max).toLowerCase()}</p>
                    <p className="text-xs text-muted-foreground">
                      From when the vendor accepts: up to {quote.prep_time_minutes} min to prepare your order, then the ride to you.
                    </p>
                  </div>
                </div>
              )}

              <CheckoutOffers
                role="customer"
                promotionName={quote.promotion_name}
                discount={quote.discount_amount}
                usesLeft={quote.promotion_uses_left}
                couponApplied={couponApplied}
                // An items offer only fits its own business
                fits={(o) => o.applies_to !== 'items' || o.vendor_id === vendorId}
                onUseCode={setCoupon}
                vehicleType={quote.vehicle_type}
                distanceKm={quote.distance_km}
                modes={quote.modes}
                onPickMode={setMode}
                disabled={confirming}
              />

              <CouponField
                coupon={coupon}
                onChange={setCoupon}
                status={quote.coupon_status}
                promotionName={quote.promotion_name}
                message={quote.coupon_message}
                usesLeft={quote.promotion_uses_left}
                checking={isFetching}
                disabled={confirming}
              />
            </>
          )}

          {selected && (
            <div className="space-y-2 rounded-md border p-3">
              <PriceBreakdown
                subtotal={quote?.subtotal ?? cartSubtotal}
                serviceCharge={quote?.service_charge ?? null}
                deliveryFee={deliverable ? quote.delivery_fee : null}
                discount={deliverable ? quote.discount_amount : null}
                discountLabel={quote?.promotion_name}
                total={deliverable ? quote.total_amount : null}
                walletAmount={canOrder ? quote.wallet_amount : null}
                cardAmount={canOrder ? quote.card_amount : null}
                loading={quoteLoading}
              />
              {problem && <p className="text-xs text-destructive">{problem}</p>}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selected && canOrder && onConfirm(selected, {
                vehicleType: mode ? quote.vehicle_type : null,
                couponCode: couponApplied ? coupon : null,
              })}
              disabled={!selected || !canOrder || confirming || isFetching}
            >
              {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {payLabel}
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
