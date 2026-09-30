import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import HandoverCodeCard from '@/components/orders/HandoverCodeCard';
import PickupDetails from '@/components/rider/PickupDetails';
import HandoverCodeDialog from '@/components/orders/HandoverCodeDialog';
import { orderActions } from '@/services/orderActions';
import { errorMessage } from '@/lib/address';

interface RiderDeliveryActionsProps {
  orderId: string;
  /** The order's status (orderStatusForDelivery converts a delivery row's status) */
  status: string;
  onChanged?: () => void;
  compact?: boolean;
  /** Show the vendor's address and phone with the pickup code (default true) */
  showPickupDetails?: boolean;
}

// What the rider does next on an order they've accepted:
//   rider_assigned   -> "Head to vendor"
//   rider_assigned / picking_up -> show the pickup code; the vendor enters it
//   out_for_delivery -> "Complete delivery" with the customer's code
const RiderDeliveryActions = ({ orderId, status, onChanged, compact, showPickupDetails = true }: RiderDeliveryActionsProps) => {
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const startPickup = async () => {
    setBusy(true);
    try {
      await orderActions.startPickup(orderId);
      toast.success('The customer has been told you’re on the way to the vendor');
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
      {(status === 'rider_assigned' || status === 'picking_up') && (
        <>
          {showPickupDetails && <PickupDetails orderId={orderId} />}
          <HandoverCodeCard orderId={orderId} kind="pickup" />
        </>
      )}

      {status === 'rider_assigned' && (
        <Button size={size} onClick={startPickup} disabled={busy} className="w-full sm:w-auto">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Head to vendor
        </Button>
      )}

      {status === 'picking_up' && (
        <p className="text-sm text-muted-foreground">
          At the vendor, check the items, then give them your pickup code. The order moves to “Out for delivery” once they enter it.
        </p>
      )}

      {status === 'out_for_delivery' && (
        <>
          <Button size={size} onClick={() => setShowCode(true)} className="w-full sm:w-auto">
            Complete delivery
          </Button>
          <HandoverCodeDialog
            open={showCode}
            onOpenChange={setShowCode}
            title="Complete delivery"
            description="Hand over the order, then ask the customer for their 4-digit delivery code."
            confirmLabel="Confirm delivery"
            onSubmit={(code) => orderActions.confirmDelivery(orderId, code)}
            onConfirmed={() => {
              toast.success('Delivered! Your earning has been added to your wallet.');
              onChanged?.();
            }}
          />
        </>
      )}
    </div>
  );
};

export default RiderDeliveryActions;
