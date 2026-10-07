
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
  };
}

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
          vendor_name: delivery.orders?.vendor_profile?.name || 'Unknown Vendor',
          vendor_phone: delivery.orders?.vendor_profile?.phone || '',
          customer_name: delivery.orders?.customer_profile?.name || delivery.orders?.customer_profile?.email || 'Customer',
          customer_email: delivery.orders?.customer_profile?.email || '',
          customer_phone: delivery.orders?.customer_profile?.phone || '',
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
      setAvailableDeliveries(formattedDeliveries);
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
        vendor_name: delivery.orders?.vendor_profile?.name || 'Unknown Vendor',
        vendor_phone: delivery.orders?.vendor_profile?.phone || '',
        customer_name: delivery.orders?.customer_profile?.name || 'Customer',
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
      toast.success('Delivery accepted! Head to the vendor when you’re ready.');
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
      toast.success('The customer has been told you’re on the way to the vendor');
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
