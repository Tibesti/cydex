import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Separator } from '@/components/ui/separator';
import { formatNaira } from '@/lib/pricing';

interface Line { label: string; amount: number; negative?: boolean }

const Breakdown = ({ lines, total, note }: { lines: Line[]; total: Line; note: string }) => (
  <div className="space-y-1.5 text-sm">
    {lines.map((l) => (
      <div key={l.label} className="flex justify-between">
        <span className="text-muted-foreground">{l.label}</span>
        <span>{l.negative ? `−${formatNaira(l.amount)}` : formatNaira(l.amount)}</span>
      </div>
    ))}
    <Separator className="my-1" />
    <div className="flex justify-between font-semibold">
      <span>{total.label}</span>
      <span>{formatNaira(total.amount)}</span>
    </div>
    <p className="pt-1 text-xs text-muted-foreground">{note}</p>
  </div>
);

const creditNote = (status: string, paymentStatus: string, who: string) => {
  if (paymentStatus === 'refunded' || status === 'cancelled' || status === 'rejected') {
    return 'The customer was refunded, so nothing is credited for this order.';
  }
  return status === 'delivered'
    ? `Added to your wallet when the order was delivered.`
    : `Added to your wallet once the ${who} is delivered.`;
};

// Vendor's view of an order's money: items total, Cydex's commission, and what
// they get. Never shows the customer's Service Charge or delivery fee.
export const VendorEarningsBreakdown = ({ order }: {
  order: { id: string; subtotal: number; status: string; payment_status: string };
}) => {
  const { data: hold } = useQuery({
    queryKey: ['payment-hold', order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_holds')
        .select('vendor_amount, platform_fee')
        .eq('order_id', order.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const items = Number(order.subtotal ?? 0);
  const commission = hold ? Number(hold.platform_fee ?? 0) : null;
  const yours = hold ? Number(hold.vendor_amount ?? 0) : null;
  if (commission === null || yours === null) {
    return <p className="text-sm text-muted-foreground">Items total: {formatNaira(items)}</p>;
  }

  return (
    <Breakdown
      lines={[
        { label: 'Items total', amount: items },
        { label: 'Cydex commission', amount: commission, negative: true },
      ]}
      total={{ label: order.status === 'delivered' ? 'Credited to you' : 'You’ll receive', amount: yours }}
      note={creditNote(order.status, order.payment_status, 'order')}
    />
  );
};

// Rider's view of a delivery's money: the delivery fee, Cydex's cut, and what
// they get.
export const RiderEarningsBreakdown = ({ orderId, status, paymentStatus }: {
  orderId: string; status: string; paymentStatus: string;
}) => {
  const { data: delivery } = useQuery({
    queryKey: ['delivery-earning', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('delivery_fee, rider_earning')
        .eq('order_id', orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!delivery) return null;
  const fee = Number(delivery.delivery_fee ?? 0);
  const earning = Number(delivery.rider_earning ?? 0);

  return (
    <Breakdown
      lines={[
        { label: 'Delivery fee paid', amount: fee },
        { label: 'Cydex commission', amount: fee - earning, negative: true },
      ]}
      total={{ label: status === 'delivered' ? 'Credited to you' : 'You’ll receive', amount: earning }}
      note={creditNote(status, paymentStatus, 'order')}
    />
  );
};
