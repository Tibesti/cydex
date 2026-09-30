import React from 'react';
import { Button } from '@/components/ui/button';
import { Phone, Truck } from 'lucide-react';
import { isValidPhone } from '@/lib/phone';

interface Rider {
  name: string;
  phone: string;
  photo: string | null;
}

interface DeliveryAgentCardProps {
  rider: Rider;
  /** The order's status, for the "what your rider is doing" line */
  status: string;
}

const RIDER_STATUS: Record<string, string> = {
  rider_assigned: 'Accepted your order and will head to the vendor shortly',
  picking_up: 'On the way to the vendor to collect your order',
  out_for_delivery: 'On the way to you with your order',
};

// The customer's rider: who they are, what they're doing, and how to call them
const DeliveryAgentCard = ({ rider, status }: DeliveryAgentCardProps) => {
  const phone = isValidPhone(rider.phone) ? rider.phone.trim() : null;
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-3 sm:p-4 dark:border-green-500/30 dark:bg-green-500/10">
      <h3 className="mb-3 text-sm font-medium sm:text-base">Your rider</h3>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-background sm:h-12 sm:w-12">
          {rider.photo ? (
            <img src={rider.photo} alt={rider.name} className="h-10 w-10 rounded-full object-cover sm:h-12 sm:w-12" />
          ) : (
            <Truck className="h-5 w-5 text-muted-foreground sm:h-6 sm:w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold sm:text-base">{rider.name}</p>
          {RIDER_STATUS[status] && (
            <p className="text-xs text-green-700 dark:text-green-300 sm:text-sm">{RIDER_STATUS[status]}</p>
          )}
          {phone ? (
            <a href={`tel:${phone}`} className="text-sm font-medium hover:underline">{phone}</a>
          ) : (
            <p className="text-xs text-muted-foreground sm:text-sm">Phone number not available</p>
          )}
        </div>
        {phone && (
          <Button asChild variant="outline" size="sm" className="h-8 flex-shrink-0 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm">
            <a href={`tel:${phone}`}>
              <Phone className="mr-1 h-4 w-4" />
              Call
            </a>
          </Button>
        )}
      </div>
    </div>
  );
};

export default DeliveryAgentCard;
