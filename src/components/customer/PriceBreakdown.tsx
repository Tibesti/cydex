import { Separator } from '@/components/ui/separator';
import { formatNaira } from '@/lib/pricing';

interface PriceBreakdownProps {
  /** Items total; omit for deliveries with no items (Cydex Express) */
  subtotal?: number | null;
  serviceCharge: number | null;
  deliveryFee: number | null;
  /** Promotion or coupon taken off, shown as "Discount" */
  discount?: number | null;
  /** Not shown on the line any more (the box above the price names the discount); kept for callers */
  discountLabel?: string | null;
  total: number | null;
  /** Wallet first, card for the rest (shown when the wallet covers something) */
  walletAmount?: number | null;
  cardAmount?: number | null;
  loading?: boolean;
}

// Items + Service Charge + Delivery − Discount = Total. The service charge is
// shown as an amount only (never as a percentage).
export const PriceBreakdown = ({
  subtotal, serviceCharge, deliveryFee, discount, total, walletAmount, cardAmount, loading,
}: PriceBreakdownProps) => {
  const amount = (value: number | null) =>
    loading ? <span className="inline-block h-4 w-16 animate-pulse rounded bg-muted" /> : value === null ? '—' : formatNaira(value);

  return (
    <div className="space-y-1.5 text-sm">
      {subtotal != null && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Items</span>
          <span>{formatNaira(subtotal)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Delivery</span>
        <span>{amount(deliveryFee)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Service Charge</span>
        <span>{amount(serviceCharge)}</span>
      </div>
      {!!discount && discount > 0 && (
        <div className="flex justify-between text-green-700 dark:text-green-400">
          <span className="min-w-0 truncate pr-2">Discount</span>
          <span className="shrink-0">−{formatNaira(discount)}</span>
        </div>
      )}
      <Separator className="my-1" />
      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>{amount(total)}</span>
      </div>
      {!!walletAmount && walletAmount > 0 && total !== null && !loading && (
        <div className="space-y-1 pt-1 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>From your wallet</span>
            <span>{formatNaira(walletAmount)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>{cardAmount ? 'Pay by card or transfer' : 'Nothing more to pay'}</span>
            <span>{formatNaira(cardAmount ?? 0)}</span>
          </div>
        </div>
      )}
    </div>
  );
};
