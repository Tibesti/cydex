
import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { orderActions } from '@/services/orderActions';
import { errorMessage } from '@/lib/address';

export interface DeliveryData {
  id: string;
  order_id: string;
  status: 'available' | 'accepted' | 'picking_up' | 'picked_up' | 'delivering' | 'delivered' | 'cancelled';
  delivery_fee: number;
  // Rider's share of the delivery fee (85%), set by the database
  rider_earning: number | null;
  eco_bonus: number;
  tip_amount: number;
  estimated_pickup_time: string;
  estimated_delivery_time: string;
  actual_distance: number;
  carbon_saved: number;
  pickup_location: any;
  delivery_location: any;
  special_instructions: string;
  vendor_name?: string;
  vendor_phone?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  delivery_address?: any;
  items_count?: number;
  order_items?: any[];
  /** 'customer' (from a vendor), 'rider_request' (a vendor's own delivery) or 'express' (a customer's own item) */
  order_kind?: string;
  /** Several drop-offs collected together from one vendor: accepting one takes them all */
  batch_id?: string | null;
  /** This drop-off's place in the batch (1 = first) */
  batch_seq?: number | null;
  /** How many drop-offs of the batch are in this list */
  batch_stops?: number;
  order?: {
    customer_profile?: { name: string; email: string; phone: string };
    vendor_profile?: { name: string; phone?: string | null };
    order_items?: any[];
    subtotal?: number;
    order_number?: string;
    status?: string;
    payment_status?: string;
    /** Above 0 when an admin put the order back in the pool: shown first */
    dispatch_priority?: number;
    delivery_address?: any;
    special_instructions?: string;
    order_type?: string | null;
    batch_id?: string | null;
    batch_seq?: number | null;
    pickup_address?: any;
  };
}

// Who the rider collects from and delivers to. Vendor orders: the vendor and
// the customer. Rider requests: the vendor and the recipient the vendor named.
// Cydex Express: the sender (at the pickup point) and their recipient.
type Party = { name?: string | null; email?: string | null; phone?: string | null } | null;
const describeParties = (delivery: {
  pickup_location?: unknown;
  delivery_location?: unknown;
  orders?: {
    order_type?: string | null; batch_id?: string | null; batch_seq?: number | null;
    pickup_address?: unknown; delivery_address?: unknown; customer_profile?: Party; vendor_profile?: Party;
  } | null;
}) => {
  const order = delivery.orders ?? {};
  const pickup = (delivery.pickup_location ?? order.pickup_address ?? {}) as Record<string, string | undefined>;
  const dropoff = (order.delivery_address ?? delivery.delivery_location ?? {}) as Record<string, string | undefined>;
  const express = order.order_type === 'express';
  const named = order.order_type === 'express' || order.order_type === 'rider_request';
  return {
    order_kind: order.order_type ?? 'customer',
    batch_id: order.batch_id ?? null,
    batch_seq: order.batch_seq ?? null,
    vendor_name: express ? `${pickup.name || order.customer_profile?.name || 'Sender'} (Cydex Express)` : order.vendor_profile?.name || 'Unknown Vendor',
    vendor_phone: express ? pickup.phone || order.customer_profile?.phone || '' : order.vendor_profile?.phone || '',
    customer_name: (named && dropoff.name) || order.customer_profile?.name || order.customer_profile?.email || 'Customer',
    customer_phone: (named && dropoff.phone) || order.customer_profile?.phone || '',
  };
};

// One card per batch in the available list: the first drop-off stands for all
// of them, with the fees added up
const collapseBatches = (deliveries: DeliveryData[]): DeliveryData[] => {
  const groups = new Map<string, DeliveryData[]>();
  for (const d of deliveries) if (d.batch_id) groups.set(d.batch_id, [...(groups.get(d.batch_id) ?? []), d]);
  const sum = (stops: DeliveryData[], key: 'delivery_fee' | 'rider_earning') => stops.reduce((n, x) => n + Number(x[key] ?? 0), 0);
  return deliveries.flatMap((d) => {
    const stops = d.batch_id ? groups.get(d.batch_id)! : null;
    if (!stops || stops.length === 1) return [d];
    const first = [...stops].sort((a, b) => (a.batch_seq ?? 0) - (b.batch_seq ?? 0))[0];
    if (d.id !== first.id) return [];
    return [{ ...d, batch_stops: stops.length, delivery_fee: sum(stops, 'delivery_fee'), rider_earning: sum(stops, 'rider_earning') }];
  });
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export const useRiderDeliveries = () => {
  const { user } = useAuth();
  const [availableDeliveries, setAvailableDeliveries] = useState<DeliveryData[]>([]);
  const [currentDeliveries, setCurrentDeliveries] = useState<DeliveryData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retryWithBackoff = async <T>(
    operation: () => Promise<T>,
    retries = MAX_RETRIES
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0) {
        console.log(`Retrying operation, ${retries} attempts remaining`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (MAX_RETRIES - retries + 1)));
        return retryWithBackoff(operation, retries - 1);
      }
      throw error;
    }
  };

  const fetchAvailableDeliveries = useCallback(async () => {
    if (loading) return; // Prevent concurrent requests
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('[RiderDeliveries] Fetching available deliveries');
      
      const operation = async () => {
        const { data, error } = await supabase
          .from('deliveries')
          .select(`
            *,
            orders!inner(
              customer_id,
              vendor_id,
              subtotal,
              status,
              payment_status,
              dispatch_priority,
              delivery_address,
              special_instructions,
              order_type,
              batch_id,
              batch_seq,
              pickup_address,
              customer_profile:profiles!customer_id(name, email, phone),
              vendor_profile:profiles!vendor_id(name, phone),
              order_items(
                product_name,
                quantity,
                product_description
              )
            )
          `)
          .eq('status', 'available')
          .is('rider_id', null)
          .eq('orders.payment_status', 'paid')
          // Riders only see orders once the vendor marks them ready
          .eq('orders.status', 'ready_for_pickup')
          .order('created_at', { ascending: true })
          .limit(50); // Pagination limit for performance

        if (error) throw error;
        return data;
      };

      const data = await retryWithBackoff(operation);

      const formattedDeliveries = data?.map(delivery => {
        console.log('Processing delivery:', delivery.id, 'Customer profile:', delivery.orders?.customer_profile);
        
        return {
          ...delivery,
          ...describeParties(delivery),
          customer_email: delivery.orders?.customer_profile?.email || '',
          delivery_address: delivery.orders?.delivery_address || {},
          special_instructions: delivery.orders?.special_instructions || '',
          items_count: delivery.orders?.order_items?.length || 0,
          order_items: delivery.orders?.order_items || [],
          // Ensure order.customer_profile includes required fields
          order: {
            ...delivery.orders,
            customer_profile: {
              name: delivery.orders?.customer_profile?.name || delivery.orders?.customer_profile?.email || 'Customer',
              email: (delivery as any).orders?.customer_profile?.email || '',
              phone: (delivery as any).orders?.customer_profile?.phone || ''
            },
          }
        };
      }) || [];

      console.log('[RiderDeliveries] Available deliveries loaded:', formattedDeliveries.length);
      setAvailableDeliveries(collapseBatches(formattedDeliveries as DeliveryData[]));
    } catch (error: any) {
      console.error('[RiderDeliveries] Error fetching available deliveries:', error);
      setError('Failed to load available deliveries');
      toast.error('Failed to load available deliveries. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const fetchCurrentDeliveries = useCallback(async () => {
    if (!user?.id) {
      console.log('[RiderDeliveries] No user ID available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[RiderDeliveries] Fetching current deliveries for rider:', user.id);
      
      const operation = async () => {
        const { data, error } = await supabase
          .from('deliveries')
          .select(`
            *,
            orders!inner(
              customer_id,
              vendor_id,
              subtotal,
              order_number,
              status,
              payment_status,
              delivery_address,
              order_type,
              batch_id,
              batch_seq,
              pickup_address,
              customer_profile:profiles!customer_id(name),
              vendor_profile:profiles!vendor_id(name, phone),
              order_items(count)
            )
          `)
          .eq('rider_id', user.id)
          .in('status', ['accepted', 'picking_up', 'picked_up', 'delivering'])
          .order('accepted_at', { ascending: true });

        if (error) throw error;
        return data;
      };

      const data = await retryWithBackoff(operation);

      const formattedDeliveries = data?.map(delivery => ({
        ...delivery,
        ...describeParties(delivery),
        items_count: delivery.orders?.order_items?.length || 0,
        // Ensure order.customer_profile satisfies the DeliveryData type (name, email, phone)
        order: {
          ...delivery.orders,
          customer_profile: {
            name: delivery.orders?.customer_profile?.name || 'Customer',
            email: (delivery as any).orders?.customer_profile?.email || '',
            phone: (delivery as any).orders?.customer_profile?.phone || ''
          },
        }
      })) || [];
      // A batch's drop-offs in the order the vendor set them
      formattedDeliveries.sort((a, b) => (a.batch_seq ?? 0) - (b.batch_seq ?? 0));
      const stopsIn = (batchId: string) => formattedDeliveries.filter((d) => d.batch_id === batchId).length;
      formattedDeliveries.forEach((d) => { if (d.batch_id) (d as DeliveryData).batch_stops = stopsIn(d.batch_id); });

      console.log('[RiderDeliveries] Current deliveries loaded:', formattedDeliveries.length);
      setCurrentDeliveries(formattedDeliveries);
    } catch (error: any) {
      console.error('[RiderDeliveries] Error fetching current deliveries:', error);
      setError('Failed to load current deliveries');
      toast.error('Failed to load current deliveries. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, loading]);

  const acceptDelivery = useCallback(async (deliveryId: string) => {
    if (!user?.id) {
      toast.error('User not authenticated');
      return { success: false, orderId: null };
    }

    if (!deliveryId) {
      toast.error('Invalid delivery ID');
      return { success: false, orderId: null };
    }

    // The database checks the order is still ready, within range, and that the
    // rider has no other active delivery (rider_accept_order)
    const orderId = availableDeliveries.find(d => d.id === deliveryId)?.order_id
      ?? (await supabase.from('deliveries').select('order_id').eq('id', deliveryId).maybeSingle()).data?.order_id
      ?? null;
    if (!orderId) {
      toast.error('This order is no longer available');
      await fetchAvailableDeliveries();
      return { success: false, orderId: null };
    }

    try {
      await orderActions.riderAccept(orderId);
      toast.success('Delivery accepted! Head to the pickup point when you’re ready.');
      await Promise.all([fetchAvailableDeliveries(), fetchCurrentDeliveries()]);
      return { success: true, orderId };
    } catch (error) {
      toast.error(errorMessage(error, 'Could not accept this delivery'));
      await fetchAvailableDeliveries();
      return { success: false, orderId: null };
    }
  }, [user?.id, availableDeliveries, fetchAvailableDeliveries, fetchCurrentDeliveries]);

  // The only status a rider sets directly is "heading to the vendor". Pickup is
  // confirmed by the vendor (with the rider's code) and delivery by the rider
  // entering the customer's code (see RiderDeliveryActions).
  const updateDeliveryStatus = useCallback(async (orderId: string, status: DeliveryData['status']) => {
    if (status !== 'picking_up') {
      toast.error('Use the delivery code to complete this step');
      return false;
    }
    try {
      await orderActions.startPickup(orderId);
      toast.success('They’ve been told you’re on the way to collect it');
      await fetchCurrentDeliveries();
      return true;
    } catch (error) {
      toast.error(errorMessage(error, 'Could not update the order'));
      return false;
    }
  }, [fetchCurrentDeliveries]);

  return {
    availableDeliveries,
    currentDeliveries,
    loading,
    error,
    acceptDelivery,
    updateDeliveryStatus,
    fetchAvailableDeliveries,
    fetchCurrentDeliveries,
    refetch: {
      availableDeliveries: fetchAvailableDeliveries,
      currentDeliveries: fetchCurrentDeliveries
    }
  };
};
