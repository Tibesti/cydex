import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { orderActions } from '@/services/orderActions';
import { useHasPhone } from '@/hooks/useHasPhone';
import { errorMessage } from '@/lib/address';

// Type for database order items (as they come from the database)
interface DBOrderItem {
  id: string;
  order_id: string;
  product_id?: string;
  product_name?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  product_description?: string | null;
  product_category?: string | null;
  is_eco_friendly?: boolean | null;
  carbon_impact?: number | null;
  created_at?: string;
  weight_kg?: number | null;
  [key: string]: any; // Allow other properties
}

// Type for our application's order items
interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product_description: string | null;
  product_category: string | null;
  is_eco_friendly: boolean;
  carbon_impact: number;
  created_at: string;
  weight_kg: number | null;
}

interface CustomerData {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

export interface VendorOrder {
  id: string;
  order_number: string;
  customer_id: string;
  vendor_id: string;
  status: string;
  payment_status: string;
  delivery_type: string;
  total_amount: number;
  subtotal: number;
  delivery_fee: number;
  created_at: string;
  updated_at: string;
  delivery_address: any;
  customer: CustomerData;
  order_items: OrderItem[];
  rider_id?: string;
  delivered_at?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  vendor_accepted_at?: string;
  rider_assigned_at?: string;
  picked_up_at?: string;
  ready_for_pickup_at?: string;
  time_slot?: string;
  special_instructions?: string;
  service_charge?: number;
  rider?: { id: string; name: string; phone?: string | null } | null;
}

export const useVendorOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Vendors need a phone number on their profile to accept orders
  const hasPhone = useHasPhone();

  const loadOrders = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch orders for the current vendor
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('vendor_id', user.id)
        // Customer orders only; the vendor's own rider requests have their own page
        .eq('order_type', 'customer')
        // Unpaid orders are hidden until Squad confirms payment; refunded ones stay for the record
        .in('payment_status', ['paid', 'refunded'])
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      
      if (!orders?.length) {
        setOrders([]);
        return;
      }

      // Get order items for all orders
      const orderIds = orders.map(order => order.id);
      const { data: orderItems = [], error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds);

      if (itemsError) throw itemsError;

      // Get unique customer IDs
      const customerIds = [...new Set(orders
        .map(order => order.customer_id)
        .filter(Boolean) as string[]
      )];

      // Fetch customer profiles
      const customersMap = new Map<string, CustomerData>();
      
      if (customerIds.length > 0) {
        // Define a type for the profile data
        type ProfileData = {
          id: string;
          email?: string | null;
          full_name?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          [key: string]: any; // Allow other properties
        };

        try {
          // Fetch all profile data at once
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', customerIds);

          if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
            throw profilesError;
          }
          
          if (profiles && profiles.length > 0) {
            // Process each profile
            profiles.forEach((profile: ProfileData) => {
              if (!profile?.id) return;
              
              // Extract data with fallbacks
              const id = profile.id;
              const email = profile.email?.trim() || `user-${id.substring(0, 6)}@example.com`;
              
              // Determine the best name to use
              let name = 'Customer';
              if (profile.full_name) {
                name = profile.full_name;
              } else if (profile.first_name || profile.last_name) {
                name = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
              } else if (profile.email) {
                name = profile.email.split('@')[0];
              } else {
                name = `Customer ${id.substring(0, 6)}`;
              }
              
              const phone = profile.phone?.trim() || 'Not provided';
              
              customersMap.set(id, {
                id,
                name: name.trim(),
                email: email.trim(),
                phone
              });
            });
          }
        } catch (error) {
          console.error('Error processing profiles:', error);
          // Continue with empty profiles map if there's an error
          // The fallback in the order processing will handle missing profiles
        }
      }

      // Riders on these orders
      const riderIds = [...new Set(orders.map(order => order.rider_id).filter(Boolean) as string[])];
      const ridersMap = new Map<string, { id: string; name: string; phone: string | null }>();
      if (riderIds.length > 0) {
        const { data: riders } = await supabase.from('profiles').select('id, name, phone').in('id', riderIds);
        riders?.forEach(r => ridersMap.set(r.id, { id: r.id, name: r.name || 'Rider', phone: r.phone }));
      }

      // Process and combine all data
      const processedOrders = orders.map(order => {
        // Get or create customer data
        const customer = order.customer_id && customersMap.get(order.customer_id)
          ? customersMap.get(order.customer_id)!
          : {
              id: order.customer_id || 'unknown',
              name: 'Customer',
              email: 'no-email@example.com',
              phone: 'Not provided'
            };

        // Get and transform order items to match the OrderItem interface
        const items = (orderItems as DBOrderItem[])
          .filter(item => item.order_id === order.id)
          .map(item => {
            const orderItem: OrderItem = {
              id: item.id,
              order_id: item.order_id,
              product_id: item.product_id || 'unknown-product',
              product_name: item.product_name || 'Unknown Product',
              quantity: item.quantity ?? 1,
              unit_price: item.unit_price ?? 0,
              total_price: item.total_price ?? 0,
              product_description: item.product_description ?? null,
              product_category: item.product_category ?? null,
              is_eco_friendly: item.is_eco_friendly ?? false,
              carbon_impact: item.carbon_impact ?? 0,
              created_at: item.created_at || new Date().toISOString(),
              weight_kg: item.weight_kg ?? null
            };
            return orderItem;
          });

        return {
          ...order,
          customer,
          rider: order.rider_id ? ridersMap.get(order.rider_id) ?? null : null,
          order_items: items
        };
      });

      setOrders(processedOrders);
    } catch (err) {
      console.error('Error loading orders:', err);
      setError('Failed to load orders');
      toast.error('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Load orders on mount and when loadOrders changes
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Refresh function
  const refresh = useCallback(() => loadOrders(), [loadOrders]);

  // Live updates when an order changes (payment confirmed, rider assigned, ...)
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`vendor-orders-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `vendor_id=eq.${user.id}` }, () => {
        loadOrders();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadOrders]);

  const runAction = useCallback(async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    try {
      await action();
      toast.success(success);
      await loadOrders();
      return true;
    } catch (e) {
      toast.error(errorMessage(e, 'Could not update the order'));
      return false;
    }
  }, [loadOrders]);

  const acceptOrder = useCallback(
    (orderId: string) => runAction(() => orderActions.accept(orderId), 'Order accepted'), [runAction]);
  const markReady = useCallback(
    (orderId: string) => runAction(() => orderActions.markReady(orderId), 'Order marked ready. Nearby riders have been notified.'),
    [runAction]);
  const rejectOrder = useCallback(
    (orderId: string, reason?: string) =>
      runAction(() => orderActions.reject(orderId, reason), 'Order rejected. If it was paid, the customer has been refunded to their wallet.'),
    [runAction]);

  return {
    orders,
    loading,
    error,
    refresh,
    hasPhone,
    acceptOrder,
    markReady,
    rejectOrder
  };
};

export default useVendorOrders;
