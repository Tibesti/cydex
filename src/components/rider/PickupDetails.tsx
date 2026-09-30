import { useQuery } from '@tanstack/react-query';
import { MapPin, Phone, Store } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { isValidPhone } from '@/lib/phone';

interface PickupInfo {
  vendorName: string;
  vendorPhone: string;
  address: string;
  directions: string;
}

// Where the rider collects the order: vendor, full store address (never
// shortened) and a tap-to-call phone number.
const PickupDetails = ({ orderId, className }: { orderId: string; className?: string }) => {
  const { data } = useQuery({
    queryKey: ['pickup-details', orderId],
    queryFn: async (): Promise<PickupInfo> => {
      const [{ data: delivery }, { data: order }] = await Promise.all([
        supabase.from('deliveries').select('pickup_location').eq('order_id', orderId).maybeSingle(),
        supabase.from('orders').select('vendor:profiles!orders_vendor_id_fkey(name, phone)').eq('id', orderId).maybeSingle(),
      ]);
      const pickup = (delivery?.pickup_location ?? {}) as Record<string, string | undefined>;
      const vendor = (order?.vendor ?? {}) as { name?: string | null; phone?: string | null };
      return {
        vendorName: vendor.name || 'Vendor',
        vendorPhone: isValidPhone(vendor.phone) ? vendor.phone.trim() : '',
        address: pickup.formatted_address || pickup.address || pickup.street || '',
        directions: pickup.additional_info || '',
      };
    },
  });

  if (!data) return null;

  return (
    <div className={cn('space-y-1.5 rounded-lg border p-3 text-sm', className)}>
      <div className="flex items-center gap-2 font-medium">
        <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="break-words">Pick up from {data.vendorName}</span>
      </div>
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="whitespace-normal break-words text-muted-foreground">
          {data.address || 'Store address not available'}
        </span>
      </div>
      {data.directions && (
        <p className="break-words pl-6 text-xs text-muted-foreground">Directions: {data.directions}</p>
      )}
      <div className="flex items-center gap-2">
        <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
        {data.vendorPhone ? (
          <a href={`tel:${data.vendorPhone}`} className="font-medium hover:underline">{data.vendorPhone}</a>
        ) : (
          <span className="text-muted-foreground">Phone not available</span>
        )}
      </div>
    </div>
  );
};

export default PickupDetails;
