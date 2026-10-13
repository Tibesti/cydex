import { useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import HandoverCodeCard from '@/components/orders/HandoverCodeCard';
import PickupDetails, { usePickupInfo } from '@/components/rider/PickupDetails';
import HandoverCodeDialog from '@/components/orders/HandoverCodeDialog';
import { orderActions } from '@/services/orderActions';
import { errorMessage } from '@/lib/address';

interface RiderDeliveryActionsProps {
  orderId: string;
  /** The order's status (orderStatusForDelivery converts a delivery row's status) */
  status: string;
  onChanged?: () => void;
  compact?: boolean;
  /** Show the pickup address and phone with the pickup code (default true) */
  showPickupDetails?: boolean;
}

// What the rider does next on an order they've accepted:
//   rider_assigned   -> "Head to vendor"
//   rider_assigned / picking_up -> show the pickup code; the vendor (or the
//                       sender of a Cydex Express delivery) enters it
//   out_for_delivery -> "I've arrived" (tells the customer), "Complete delivery"
//   arrived          -> "Complete delivery" with the customer's code
const RiderDeliveryActions = ({ orderId, status, onChanged, compact, showPickupDetails = true }: RiderDeliveryActionsProps) => {
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const { data: pickup } = usePickupInfo(orderId);
  const express = !!pickup?.express;
  const batch = (pickup?.batchStops ?? 0) > 1;

  const act = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      onChanged?.();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not update the order'));
    } finally {
      setBusy(false);
    }
  };

  const size = compact ? 'sm' : 'default';

  return (
    <div className="space-y-3">
      {batch && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">Drop-off {pickup!.batchSeq} of {pickup!.batchStops}.</span>{' '}
          <span className="text-muted-foreground">
            Collect every package of this batch in one trip (one pickup code covers them all), then deliver them in order.
            Each drop-off has its own delivery code.
          </span>
        </p>
      )}

      {(status === 'rider_assigned' || status === 'picking_up') && (
        <>
          {showPickupDetails && <PickupDetails orderId={orderId} />}
          <HandoverCodeCard
            orderId={orderId}
            kind="pickup"
            hint={express ? 'Give this code to the sender when you collect the item. They enter it in their app.' : undefined}
          />
        </>
      )}

      {status === 'rider_assigned' && (
        <Button
          size={size}
          onClick={() => act(() => orderActions.startPickup(orderId), 'They’ve been told you’re on the way to collect it')}
          disabled={busy}
          className="w-full sm:w-auto"
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {express ? 'Head to pickup' : 'Head to vendor'}
        </Button>
      )}

      {status === 'picking_up' && (
        <p className="text-sm text-muted-foreground">
          {express
            ? 'At the pickup point, check the item, then give the sender your pickup code. The delivery moves to “Out for delivery” once they enter it.'
            : 'At the vendor, check the items, then give them your pickup code. The order moves to “Out for delivery” once they enter it.'}
        </p>
      )}

      {status === 'arrived' && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
          They know you're around. Hand over the {express ? 'item' : 'order'}, then ask for the delivery code.
        </p>
      )}

      {(status === 'out_for_delivery' || status === 'arrived') && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {status === 'out_for_delivery' && (
            <Button
              size={size}
              variant="outline"
              onClick={() => act(() => orderActions.markArrived(orderId), 'They’ve been told you’re around')}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}
              I've arrived
            </Button>
          )}
          <Button size={size} onClick={() => setShowCode(true)} className="w-full sm:w-auto">
            Complete delivery
          </Button>
          <HandoverCodeDialog
            open={showCode}
            onOpenChange={setShowCode}
            title="Complete delivery"
            description={`Hand over the ${express ? 'item' : 'order'}, then ask the person receiving it for their 4-digit delivery code.`}
            confirmLabel="Confirm delivery"
            onSubmit={(code) => orderActions.confirmDelivery(orderId, code)}
            onConfirmed={() => {
              toast.success('Delivered! Your earning has been added to your wallet.');
              onChanged?.();
            }}
          />
        </div>
      )}
    </div>
  );
};

export default RiderDeliveryActions;
