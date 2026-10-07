import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ChevronRight, MapPin } from 'lucide-react';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { formatNaira } from '@/lib/pricing';
import type { RiderHistoryItem } from '@/hooks/rider/useRiderDeliveryHistory';

// Rows of a rider's deliveries: vendor -> drop-off, status, earning, date
const RiderDeliveryList = ({ items }: { items: RiderHistoryItem[] }) => {
  const navigate = useNavigate();
  return (
    <ul className="divide-y">
      {items.map((o) => {
        const earning = o.deliveries?.[0]?.rider_earning;
        const dropOff = o.delivery_address?.street || o.delivery_address?.formatted_address;
        return (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => navigate(`/rider/order/${o.id}`)}
              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/60"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">#{o.order_number}</span>
                  <OrderStatusBadge status={o.status} className="text-xs" />
                </div>
                <p className="break-words text-xs text-muted-foreground">
                  {o.vendor?.name || 'Vendor'}
                  {dropOff && (
                    <>
                      {' '}<MapPin className="inline h-3 w-3" /> {dropOff}
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(o.delivered_at ?? o.created_at), 'd MMM yyyy, h:mm a')}
                </p>
              </div>
              {earning != null && (
                <span className="shrink-0 text-sm font-semibold">{formatNaira(Number(earning))}</span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default RiderDeliveryList;
