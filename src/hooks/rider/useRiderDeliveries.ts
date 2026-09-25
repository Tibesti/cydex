
import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  delivery_address?: any;
  items_count?: number;
  order_items?: any[];
  order?: {
    customer_profile?: { name: string; email: string; phone: string };
    vendor_profile?: { name: string };
    order_items?: any[];
    subtotal?: number;
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
              delivery_address,
              special_instructions,
              customer_profile:profiles!customer_id(name, email, phone),
              vendor_profile:profiles!vendor_id(name),
              order_items(
                product_name,
                quantity,
                unit_price,
                total_price,
                product_description
              )
            )
          `)
          .eq('status', 'available')
          .is('rider_id', null)
          .eq('orders.payment_status', 'paid')
          .in('orders.status', ['accepted', 'processing', 'ready_for_pickup'])
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
              customer_profile:profiles!customer_id(name),
              vendor_profile:profiles!vendor_id(name),
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

    // Check if rider already has an active delivery
    try {
      const { data: activeDeliveries, error: checkError } = await supabase
        .from('deliveries')
        .select('id')
        .eq('rider_id', user.id)
        .in('status', ['accepted', 'picking_up', 'picked_up', 'delivering'])
        .limit(1);

      if (checkError) throw checkError;

      if (activeDeliveries && activeDeliveries.length > 0) {
        toast.error('You already have an active delivery. Complete it before accepting another.');
        return { success: false, orderId: null };
      }
    } catch (error) {
      console.error('[RiderDeliveries] Error checking active deliveries:', error);
      toast.error('Failed to check active deliveries');
      return { success: false, orderId: null };
    }

    try {
      console.log('[RiderDeliveries] Accepting delivery:', deliveryId);
      
      let orderId: string | null = null;

      const operation = async () => {
        // First get the delivery to find the order ID
        const { data: deliveryData, error: deliveryFetchError } = await supabase
          .from('deliveries')
          .select('order_id')
          .eq('id', deliveryId)
          .single();

        if (deliveryFetchError) throw deliveryFetchError;
        orderId = deliveryData.order_id;

        // Update the delivery
        const { error: updateError } = await supabase
          .from('deliveries')
          .update({
            rider_id: user.id,
            status: 'accepted',
            accepted_at: new Date().toISOString()
          })
          .eq('id', deliveryId)
          .eq('status', 'available')
          .is('rider_id', null);

        if (updateError) throw updateError;

        // Update the order to assign rider and change status to indicate rider is assigned
        const { error: orderError } = await supabase
          .from('orders')
          .update({ 
            rider_id: user.id,
            status: 'rider_assigned',
            rider_assigned_at: new Date().toISOString()
          })
          .eq('id', orderId);

        if (orderError) throw orderError;
      };

      await retryWithBackoff(operation);

      toast.success('Delivery accepted successfully!');
      console.log('[RiderDeliveries] Delivery accepted successfully');
      
      // Refresh data
      await Promise.all([
        fetchAvailableDeliveries(),
        fetchCurrentDeliveries()
      ]);

      return { success: true, orderId };
    } catch (error: any) {
      console.error('[RiderDeliveries] Error accepting delivery:', error);
      
      if (error.message?.includes('already accepted')) {
        toast.error('This delivery has already been accepted by another rider');
      } else if (error.message?.includes('not found')) {
        toast.error('Delivery not found or no longer available');
      } else {
        toast.error('Failed to accept delivery. Please try again.');
      }
      
      // Refresh available deliveries to remove stale data
      await fetchAvailableDeliveries();
      return { success: false, orderId: null };
    }
  }, [user?.id, fetchAvailableDeliveries, fetchCurrentDeliveries]);

  const updateDeliveryStatus = useCallback(async (orderId: string, status: DeliveryData['status']) => {
    if (!orderId || !status) {
      toast.error('Invalid order ID or status');
      return false;
    }

    try {
      console.log('[RiderDeliveries] Updating order status:', orderId, status);
      
      const operation = async () => {
        // Map delivery statuses to order statuses
        const orderStatusMap: Record<string, string> = {
          'picked_up': 'out_for_delivery',
          'delivering': 'out_for_delivery', 
          'delivered': 'delivered'
        };

        const orderStatus = orderStatusMap[status] || status;
        
        // Update the order first
        const { error: orderError } = await supabase
          .from('orders')
          .update({ 
            status: orderStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId);

        if (orderError) throw orderError;

        // Find and update the delivery record
        const { data: delivery, error: deliveryFetchError } = await supabase
          .from('deliveries')
          .select('id')
          .eq('order_id', orderId)
          .eq('rider_id', user?.id)
          .maybeSingle();

        if (deliveryFetchError) throw deliveryFetchError;
        
        if (!delivery) {
          console.log('[RiderDeliveries] No delivery record found for order:', orderId);
          return; // Just update the order status, no delivery record to update
        }

        const updateData: any = { 
          status,
          updated_at: new Date().toISOString()
        };
        
        // Add appropriate timestamps
        if (status === 'picking_up') {
          updateData.picking_up_at = new Date().toISOString();
        } else if (status === 'picked_up') {
          updateData.picked_up_at = new Date().toISOString();
        } else if (status === 'delivering') {
          updateData.delivering_at = new Date().toISOString();
        } else if (status === 'delivered') {
          updateData.delivered_at = new Date().toISOString();
        }

        const { error: deliveryError } = await supabase
          .from('deliveries')
          .update(updateData)
          .eq('id', delivery.id)
          .eq('rider_id', user?.id);

        if (deliveryError) throw deliveryError;
      };

      await retryWithBackoff(operation);

      toast.success(`Order status updated to ${status.replace('_', ' ')}`);
      console.log('[RiderDeliveries] Status updated successfully');
      
      // Refresh current deliveries
      await fetchCurrentDeliveries();
      return true;
    } catch (error: any) {
      console.error('[RiderDeliveries] Error updating delivery status:', error);
      toast.error('Failed to update delivery status. Please try again.');
      return false;
    }
  }, [user?.id, fetchCurrentDeliveries]);

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
