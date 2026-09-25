import { Separator } from '@/components/ui/separator';
import { formatNaira } from '@/lib/pricing';

interface PriceBreakdownProps {
  subtotal: number;
  serviceCharge: number | null;
  deliveryFee: number | null;
  distanceKm?: number | null;
  total: number | null;
  loading?: boolean;
}

// Items + Service Charge + Delivery = Total. The service charge is shown as an
// amount only (never as a percentage).
export const PriceBreakdown = ({ subtotal, serviceCharge, deliveryFee, distanceKm, total, loading }: PriceBreakdownProps) => {
  const amount = (value: number | null) =>
    loading ? <span className="inline-block h-4 w-16 animate-pulse rounded bg-muted" /> : value === null ? '—' : formatNaira(value);

  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Items</span>
        <span>{formatNaira(subtotal)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Service Charge</span>
        <span>{amount(serviceCharge)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          Delivery{distanceKm !== null && distanceKm !== undefined ? ` (${distanceKm.toFixed(2)} km)` : ''}
        </span>
        <span>{amount(deliveryFee)}</span>
      </div>
      <Separator className="my-1" />
      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>{amount(total)}</span>
      </div>
    </div>
  );
};
