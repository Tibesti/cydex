import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCartContext } from '@/contexts/CartContext';
import { orderActions } from '@/services/orderActions';
import { errorMessage } from '@/lib/address';

// Import custom hooks and components
import { useOrderDetails } from '@/hooks/useOrderDetails';
import OrderDetailHeader from '@/components/customer/OrderDetailHeader';
import OrderDetailsContent from '@/components/customer/OrderDetailsContent';
import OrderNotFound from '@/components/customer/OrderNotFound';
import OrderDetailLoading from '@/components/customer/OrderDetailLoading';

const timeOf = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : null;

// Tracking steps for the order flow (docs/ORDER_FLOW.md)
const generateTrackingSteps = (order: any) => {
  const reached = (statuses: string[]) => statuses.includes(order.status);
  const paid = order.payment_status === 'paid' || order.payment_status === 'refunded';

  const steps = [
    { id: 1, title: 'Order placed', completed: true, time: timeOf(order.created_at),
      description: 'Your order has been placed' },
    { id: 2, title: 'Payment confirmed', completed: paid, time: null,
      description: paid ? 'Payment received. Waiting for the vendor to accept.' : 'Waiting for payment confirmation' },
    { id: 3, title: 'Vendor accepted',
      completed: reached(['accepted', 'ready_for_pickup', 'rider_assigned', 'picking_up', 'out_for_delivery', 'delivered']),
      time: timeOf(order.vendor_accepted_at), description: 'The vendor is preparing your order' },
    { id: 4, title: 'Ready for pickup',
      completed: reached(['ready_for_pickup', 'rider_assigned', 'picking_up', 'out_for_delivery', 'delivered']),
      time: timeOf(order.ready_for_pickup_at), description: 'Finding a rider near the vendor' },
    { id: 5, title: 'Rider assigned',
      completed: reached(['rider_assigned', 'picking_up', 'out_for_delivery', 'delivered']),
      time: timeOf(order.rider_assigned_at), description: 'A rider accepted your order' },
    { id: 6, title: 'Rider heading to vendor',
      completed: reached(['picking_up', 'out_for_delivery', 'delivered']),
      time: null, description: 'Your rider is on the way to collect your order' },
    { id: 7, title: 'Out for delivery',
      completed: reached(['out_for_delivery', 'delivered']),
      time: timeOf(order.picked_up_at), description: 'Your rider has your order and is on the way' },
    { id: 8, title: 'Delivered', completed: order.status === 'delivered',
      time: timeOf(order.delivered_at), description: 'Order delivered' },
  ];

  if (order.status === 'cancelled' || order.status === 'rejected') {
    return [
      ...steps.filter((s) => s.completed),
      {
        id: 99,
        title: order.status === 'rejected' ? 'Rejected by vendor' : 'Cancelled',
        completed: true,
        time: timeOf(order.cancelled_at),
        description: [
          order.cancel_reason,
          order.payment_status === 'refunded' ? 'Your payment was refunded to your Cydex wallet.' : null,
        ].filter(Boolean).join(' '),
      },
    ];
  }
  return steps;
};

// Rough ETA by status
const calculateETA = (status: string, deliveryType: string) => {
  if (status === 'delivered') return 'Delivered';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'rejected') return 'Rejected';
  if (status === 'out_for_delivery') {
    return deliveryType === 'express' ? '15-30 minutes' : '30-45 minutes';
  }
  if (status === 'ready_for_pickup' || status === 'rider_assigned' || status === 'picking_up') return '20-45 minutes';
  if (status === 'accepted') return '30-60 minutes';
  return '60-90 minutes';
};

// Helper function to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN'
  }).format(amount);
};

const OrderDetailPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { supabase } = useSupabase();
  const { user } = useAuth();
  const { addToCart, clearCart } = useCartContext();
  const { order, loading, error, refetch } = useOrderDetails(orderId);

  const handleCancelOrder = async () => {
    if (!order) return;
    try {
      await orderActions.cancel(order.id, 'Cancelled by customer');
      toast.success(
        order.payment_status === 'paid'
          ? 'Order cancelled. Your payment has been refunded to your wallet.'
          : 'Order cancelled',
      );
      refetch();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not cancel the order'));
    }
  };

  const handleDownloadReceipt = () => {
    if (!order) return;
    
    // In a real implementation, you would generate a PDF receipt
    // For now, we'll just show the order details
    const receiptData = {
      orderNumber: order.order_number,
      vendor: order.vendor?.name || 'Unknown Vendor',
      date: new Date(order.created_at).toLocaleDateString(),
      items: order.order_items?.map(item => ({
        name: item.product_name,
        quantity: item.quantity,
        price: formatCurrency(item.unit_price),
        total: formatCurrency(item.total_price)
      })) || [],
      subtotal: formatCurrency(order.subtotal),
      serviceCharge: formatCurrency(order.service_charge ?? 0),
      deliveryFee: formatCurrency(order.delivery_fee),
      total: formatCurrency(order.total_amount)
    };

    // For now, just log the receipt data and show success message
    console.log('Receipt data:', receiptData);
    toast.success('Receipt downloaded successfully');
    
    // TODO: Implement actual PDF generation and download
  };

  const handleReorder = async () => {
    if (!order?.order_items) {
      toast.error('No items found in this order');
      return;
    }

    try {
      // Clear existing cart
      clearCart();

      // Add all items from the order to cart
      for (const item of order.order_items) {
        addToCart({
          id: `reorder-${item.id}`, // Use a temporary ID for reorder items
          name: item.product_name,
          price: item.unit_price,
          vendor_id: order.vendor_id || '',
          vendor_name: order.vendor?.name || 'Unknown Vendor'
        }, item.quantity);
      }

      toast.success(`${order.order_items.length} items added to cart`);
      navigate('/customer/new-order');
    } catch (error) {
      console.error('Error reordering:', error);
      toast.error('Failed to add items to cart');
    }
  };

  if (loading) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="p-2 sm:p-4 md:p-6 max-w-full mx-auto">
          <OrderDetailLoading />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !order) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="p-2 sm:p-4 md:p-6 max-w-full mx-auto">
          <OrderNotFound message={error || undefined} />
        </div>
      </DashboardLayout>
    );
  }

  // Build a robust delivery address string that supports both simplified and full shapes
  const deliveryAddressStr = typeof order.delivery_address === 'object'
    ? (order.delivery_address.location
        ? order.delivery_address.location
        : [order.delivery_address.street, order.delivery_address.city, order.delivery_address.state]
            .filter(Boolean)
            .join(', '))
    : String(order.delivery_address || '');

  // Transform order data to match component expectations
  const transformedOrder = {
    id: order.id,
    vendor: order.vendor?.name || 'Vendor',
    status: order.status,
    paymentStatus: order.payment_status,
    trackingSteps: generateTrackingSteps(order),
    eta: calculateETA(order.status, order.delivery_type),
    deliveryAddress: deliveryAddressStr,
    orderDate: new Date(order.created_at).toLocaleDateString(),
    updatedAt: new Date(order.updated_at).toLocaleString(),
    items: order.order_items?.length || 0,
    rider: order.rider ? {
      name: order.rider.name,
      phone: order.rider.phone || '',
      photo: order.rider.avatar || null
    } : undefined,
    riderName: order.rider?.name,
    products: order.order_items?.map(item => ({
      id: item.id,
      name: item.product_name,
      quantity: item.quantity,
      price: formatCurrency(item.unit_price),
      image: null // We don't have product images in order_items yet
    })) || [],
    subtotal: formatCurrency(order.subtotal),
    totalAmount: formatCurrency(order.total_amount),
    serviceCharge: formatCurrency(order.service_charge ?? 0),
    deliveryFee: formatCurrency(order.delivery_fee),
    discount: formatCurrency(0), // We don't have discount tracking yet
    // Normalize payment method label - default to generic 'Card' instead of legacy 'Paystack'
    paymentMethod: order.payment_method || 'Card',
    orderNumber: order.order_number
  };

  return (
    <DashboardLayout userRole="CUSTOMER">
      <div className="p-2 sm:p-3 md:p-6 max-w-full mx-auto space-y-2 sm:space-y-3 md:space-y-6">
        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-4 md:p-6">
            <OrderDetailHeader 
              id={order.order_number}
              vendor={transformedOrder.vendor}
              status={transformedOrder.status}
              paymentStatus={transformedOrder.paymentStatus}
            />
          </CardHeader>
          
           <OrderDetailsContent 
             order={transformedOrder}
             onCancelOrder={handleCancelOrder}
             onDownloadReceipt={handleDownloadReceipt}
             onReorder={handleReorder}
           />
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default OrderDetailPage;
