import { useQuery } from '@tanstack/react-query';
import { MapPin, Phone, Store, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { isValidPhone } from '@/lib/phone';

export interface PickupInfo {
  /** Cydex Express: the rider collects from the customer who booked it, not a vendor */
  express: boolean;
  /** Several drop-offs collected together (rider request batch) */
  batchId: string | null;
  batchSeq: number | null;
  batchStops: number;
  /** Who hands the package over: the vendor, or the Express sender */
  name: string;
  phone: string;
  address: string;
  directions: string;
}

// Where the rider collects from, plus what kind of delivery it is
export const usePickupInfo = (orderId: string) =>
  useQuery({
    queryKey: ['pickup-details', orderId],
    queryFn: async (): Promise<PickupInfo> => {
      const [{ data: delivery }, { data: order }] = await Promise.all([
        supabase.from('deliveries').select('pickup_location').eq('order_id', orderId).maybeSingle(),
        supabase.from('orders')
          .select('order_type, batch_id, batch_seq, pickup_address, vendor:profiles!orders_vendor_id_fkey(name, phone)')
          .eq('id', orderId).maybeSingle(),
      ]);
      const pickup = (delivery?.pickup_location ?? order?.pickup_address ?? {}) as Record<string, string | undefined>;
      const vendor = (order?.vendor ?? {}) as { name?: string | null; phone?: string | null };
      const express = order?.order_type === 'express';
      const phone = express ? pickup.phone : vendor.phone;
      let batchStops = 0;
      if (order?.batch_id) {
        const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('batch_id', order.batch_id);
        batchStops = count ?? 0;
      }
      return {
        express,
        batchId: order?.batch_id ?? null,
        batchSeq: order?.batch_seq ?? null,
        batchStops,
        name: (express ? pickup.name : vendor.name) || (express ? 'Sender' : 'Vendor'),
        phone: isValidPhone(phone) ? phone.trim() : '',
        address: pickup.formatted_address || pickup.address || pickup.street || '',
        directions: pickup.additional_info || '',
      };
    },
  });

// Where the rider collects the order: who from, the full address (never
// shortened) and a tap-to-call phone number.
const PickupDetails = ({ orderId, className }: { orderId: string; className?: string }) => {
  const { data } = usePickupInfo(orderId);

  if (!data) return null;
  const Icon = data.express ? User : Store;

  return (
    <div className={cn('space-y-1.5 rounded-lg border p-3 text-sm', className)}>
      <div className="flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="break-words">Pick up from {data.name}{data.express ? ' (Cydex Express)' : ''}</span>
      </div>
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="whitespace-normal break-words text-muted-foreground">
          {data.address || (data.express ? 'Pickup address not available' : 'Store address not available')}
        </span>
      </div>
      {data.directions && (
        <p className="break-words pl-6 text-xs text-muted-foreground">Directions: {data.directions}</p>
      )}
      <div className="flex items-center gap-2">
        <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
        {data.phone ? (
          <a href={`tel:${data.phone}`} className="font-medium hover:underline">{data.phone}</a>
        ) : (
          <span className="text-muted-foreground">Phone not available</span>
        )}
      </div>
    </div>
  );
};

export default PickupDetails;
