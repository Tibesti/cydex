
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  vendor_id: string;
  rider_id?: string;
  status: string;
  payment_status: string;
  payment_method?: string;
  delivery_type: string;
  time_slot?: string;
  delivery_address: any;
  subtotal: number;
  delivery_fee: number;
  service_charge?: number | null;
  total_amount: number;
  carbon_credits_earned?: number;
  estimated_delivery_time?: string;
  delivered_at?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  special_instructions?: string;
  verification_code?: string;
  vendor_accepted_at?: string;
  rider_assigned_at?: string;
  picked_up_at?: string;
  ready_for_pickup_at?: string;
  created_at: string;
  updated_at: string;
  vendor?: {
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
  };
  rider?: {
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
  };
  order_items?: Array<{
    id: string;
    product_name: string;
    product_description?: string;
    product_category?: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    is_eco_friendly: boolean;
    carbon_impact: number;
  }>;
}

export const useCustomerOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          vendor:profiles!orders_vendor_id_fkey (
            name,
            email,
            phone,
            avatar
          ),
          rider:profiles!orders_rider_id_fkey (
            name,
            email,
            phone,
            avatar
          ),
          order_items (
            id,
            product_name,
            product_description,
            product_category,
            quantity,
            unit_price,
            total_price,
            is_eco_friendly,
            carbon_impact
          )
        `)
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      setOrders(ordersData as Order[]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch orders';
      setError(errorMessage);
      console.error('Error fetching orders:', err);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('customer_orders_channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `customer_id=eq.${user.id}`
        },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Initial fetch
  useEffect(() => {
    fetchOrders();
  }, [user?.id]);

  return {
    orders,
    loading,
    error,
    refetch: fetchOrders
  };
};
