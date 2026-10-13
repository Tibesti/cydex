import { formatNaira } from '@/lib/pricing';

export type PromoAudience = 'customer' | 'vendor' | 'rider' | 'all';
export type PromoTarget = 'service_charge' | 'delivery_fee' | 'items' | 'commission';

export const AUDIENCES: Record<PromoAudience, string> = {
  customer: 'Customers',
  vendor: 'Vendors',
  rider: 'Riders',
  all: 'Everyone',
};

// What a promotion can take money off, by who it's for. The same database
// field means different things to different people: 'service_charge' is the
// customer's Service Charge but the vendor's Request Rider commission.
export const TARGETS: Record<PromoAudience, Partial<Record<PromoTarget, string>>> = {
  customer: {
    delivery_fee: 'Delivery fee (orders and Cydex Express)',
    service_charge: 'Service Charge (orders and Cydex Express)',
    items: 'Items from a business',
  },
  vendor: {
    delivery_fee: 'Request Rider: delivery fee',
    service_charge: 'Request Rider: Cydex commission',
    commission: 'Commission on their sales',
  },
  rider: {
    commission: 'Commission on their deliveries',
  },
  all: {
    delivery_fee: 'Delivery fee (customers, and vendors on Request Rider)',
    service_charge: 'Service Charge (customers) and Request Rider commission (vendors)',
    commission: 'Commission (vendors on sales, riders on deliveries)',
  },
};

interface Describable {
  discount_type: string;
  discount_value: number;
  applies_to: string;
  vendor_name?: string | null;
}

// "20% off the delivery fee", "Free Service Charge", "₦200 off items from Mama Put"
// viewer: whose eyes it's read with (admin lists use the promotion's audience)
export const describePromotion = (p: Describable, viewer: PromoAudience = 'customer') => {
  const free = p.discount_type === 'percent' && Number(p.discount_value) >= 100;
  const amount = p.discount_type === 'percent' ? `${Number(p.discount_value)}% off` : `${formatNaira(Number(p.discount_value))} off`;
  const what =
    p.applies_to === 'items' ? `items from ${p.vendor_name ?? 'a business'}`
      : p.applies_to === 'delivery_fee' ? (viewer === 'vendor' ? 'Request Rider delivery fee' : 'delivery fee')
        : p.applies_to === 'service_charge' ? (viewer === 'vendor' ? 'Request Rider commission' : 'Service Charge')
          : viewer === 'rider' ? 'Cydex commission on your deliveries'
            : viewer === 'vendor' ? 'Cydex commission on your sales'
              : 'Cydex commission';
  if (free) return p.applies_to === 'items' ? `Free ${what}` : p.applies_to === 'commission' ? `No ${what}` : `Free ${what}`;
  return p.applies_to === 'items' ? `${amount} ${what}` : `${amount} the ${what}`;
};
