import { supabase } from '@/integrations/supabase/client';

// Every order status change goes through a database function that checks who
// may make it and when (supabase/migrations/20260930000000_order_flow.sql).
// Errors carry the database's message, e.g. "Orders can only be cancelled
// before the vendor accepts them".

async function run<T>(call: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await call;
  if (error) throw new Error(error.message);
  return data;
}

export const orderActions = {
  // Vendor
  accept: (orderId: string) => run(supabase.rpc('vendor_accept_order', { p_order_id: orderId })),
  markReady: (orderId: string) => run(supabase.rpc('vendor_mark_ready', { p_order_id: orderId })),
  reject: (orderId: string, reason?: string) =>
    run(supabase.rpc('vendor_reject_order', { p_order_id: orderId, p_reason: reason })),
  /** The rider's pickup code. Resolves false if the code is wrong. */
  confirmPickup: (orderId: string, code: string) =>
    run(supabase.rpc('vendor_confirm_pickup', { p_order_id: orderId, p_code: code })),

  /** The vendor's own rider request, before a rider accepts; refunds to their wallet */
  cancelRiderRequest: (orderId: string) => run(supabase.rpc('cancel_rider_request', { p_order_id: orderId })),

  // Customer
  cancel: (orderId: string, reason?: string) =>
    run(supabase.rpc('customer_cancel_order', { p_order_id: orderId, p_reason: reason })),

  // Rider
  riderAccept: (orderId: string) => run(supabase.rpc('rider_accept_order', { p_order_id: orderId })),
  startPickup: (orderId: string) => run(supabase.rpc('rider_start_pickup', { p_order_id: orderId })),
  /** The customer's delivery code. Resolves false if the code is wrong. */
  confirmDelivery: (orderId: string, code: string) =>
    run(supabase.rpc('rider_confirm_delivery', { p_order_id: orderId, p_code: code })),
};
