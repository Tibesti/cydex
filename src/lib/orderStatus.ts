// Order statuses, in the order an order moves through them.
// The database is the source of truth (docs/ORDER_FLOW.md); every change goes
// through one of the actions in src/services/orderActions.ts.
export const ORDER_STATUSES = [
  'pending',
  'accepted',
  'ready_for_pickup',
  'rider_assigned',
  'picking_up',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'rejected',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  ready_for_pickup: 'Ready for pickup',
  rider_assigned: 'Rider assigned',
  picking_up: 'Rider heading to vendor',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

export const orderStatusLabel = (status: string) =>
  LABELS[status as OrderStatus] ?? status.replace(/_/g, ' ');

// Between the vendor accepting and delivery
export const IN_PROGRESS_STATUSES: OrderStatus[] = [
  'accepted', 'ready_for_pickup', 'rider_assigned', 'picking_up', 'out_for_delivery',
];
// A rider has the order (or is on the way to collect it)
export const RIDER_ACTIVE_STATUSES: OrderStatus[] = ['rider_assigned', 'picking_up', 'out_for_delivery'];
export const CLOSED_STATUSES: OrderStatus[] = ['delivered', 'cancelled', 'rejected'];

export type StatusTone = 'waiting' | 'active' | 'done' | 'stopped';

export const orderStatusTone = (status: string): StatusTone => {
  if (status === 'delivered') return 'done';
  if (status === 'cancelled' || status === 'rejected') return 'stopped';
  if (status === 'pending') return 'waiting';
  return 'active';
};

// Customers can cancel until the vendor accepts
export const customerCanCancel = (status: string) => status === 'pending';
// Vendors can reject until a rider accepts
export const vendorCanReject = (order: { status: string; rider_id?: string | null }) =>
  ['pending', 'accepted', 'ready_for_pickup'].includes(order.status) && !order.rider_id;

// A rider's deliveries row moves alongside the order: deliveries.status -> orders.status
export const orderStatusForDelivery = (deliveryStatus: string): string =>
  ({ accepted: 'rider_assigned', picking_up: 'picking_up', picked_up: 'out_for_delivery', delivering: 'out_for_delivery' } as Record<string, string>)[
    deliveryStatus
  ] ?? deliveryStatus;
