import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCartContext } from '@/contexts/CartContext';

// Import custom hooks and components
import { useOrderDetails } from '@/hooks/useOrderDetails';
import OrderDetailHeader from '@/components/customer/OrderDetailHeader';
import OrderDetailsContent from '@/components/customer/OrderDetailsContent';
import OrderNotFound from '@/components/customer/OrderNotFound';
import OrderDetailLoading from '@/components/customer/OrderDetailLoading';

// Helper function to generate tracking steps based on order status
const generateTrackingSteps = (order: any) => {
  const steps = [
    { 
      id: 1, 
      title: 'Order Placed', 
      completed: true, 
      time: new Date(order.created_at).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      description: 'Your order has been placed successfully'
    },
    { 
      id: 2, 
      title: 'Payment Confirmed', 
      completed: order.payment_status === 'paid', 
      time: order.payment_status === 'paid' 
        ? new Date(order.updated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
        : null,
      description: order.payment_status === 'paid' 
        ? 'Payment has been confirmed. Waiting for vendor approval.' 
        : 'Waiting for payment confirmation'
    },
    { 
      id: 3, 
      title: 'Vendor Accepted', 
      completed: ['processing', 'ready', 'out_for_delivery', 'delivered'].includes(order.status), 
      time: order.vendor_accepted_at 
        ? new Date(order.vendor_accepted_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
        : null,
      description: ['processing', 'ready', 'out_for_delivery', 'delivered'].includes(order.status)
        ? 'Vendor has accepted your order. Looking for a rider...'
        : 'Waiting for vendor to accept the order'
    },
    { 
      id: 4, 
      title: 'Rider Assigned', 
      completed: ['rider_assigned', 'ready_for_pickup', 'out_for_delivery', 'delivered'].includes(order.status), 
      time: order.rider_assigned_at 
        ? new Date(order.rider_assigned_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
        : null,
      description: ['rider_assigned', 'ready_for_pickup', 'out_for_delivery', 'delivered'].includes(order.status)
        ? 'A rider has been assigned to your order'
        : 'Searching for an available rider'
    },
    { 
      id: 5, 
      title: 'Order Picked Up', 
      completed: ['out_for_delivery', 'delivered'].includes(order.status), 
      time: order.picked_up_at 
        ? new Date(order.picked_up_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
        : null,
      description: ['out_for_delivery', 'delivered'].includes(order.status)
        ? 'Order has been picked up by the rider'
        : 'Order is being prepared for pickup'
    },
    { 
      id: 6, 
      title: 'Out for Delivery', 
      completed: ['out_for_delivery', 'delivered'].includes(order.status), 
      time: order.picked_up_at 
        ? new Date(order.picked_up_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
        : null,
      description: ['out_for_delivery', 'delivered'].includes(order.status)
        ? 'Your order is on the way to you'
        : 'Waiting for rider to pick up the order'
    },
    { 
      id: 7, 
      title: 'Delivered', 
      completed: order.status === 'delivered', 
      time: order.delivered_at 
        ? new Date(order.delivered_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
        : null,
      description: order.status === 'delivered'
        ? 'Your order has been delivered successfully!'
        : 'Order will be delivered to your address'
    }
  ];

  return steps;
};

// Helper function to calculate ETA based on order status
const calculateETA = (status: string, deliveryType: string) => {
  if (status === 'delivered') return 'Delivered';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'out_for_delivery') {
    return deliveryType === 'express' ? '15-30 minutes' : '30-45 minutes';
  }
  if (status === 'ready') return '5-15 minutes until pickup';
  if (status === 'preparing') return '15-30 minutes';
  if (status === 'processing') return '30-60 minutes';
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
    if (!order || !user?.id) {
      toast.error('Unable to cancel order');
      return;
    }

    // Check if order can be cancelled
    if (!['pending', 'processing', 'confirmed'].includes(order.status)) {
      toast.error('This order cannot be cancelled at this stage');
      return;
    }

    try {
      const { error: cancelError } = await supabase
        .from('orders')
        .update({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: 'Cancelled by customer'
        })
        .eq('id', order.id)
        .eq('customer_id', user.id);

      if (cancelError) throw cancelError;

      toast.success('Your order has been cancelled successfully');
      refetch(); // Refresh the order data
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error('Failed to cancel order. Please try again.');
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
      rating: 4.8, // Default rating as we don't have rider ratings in the schema yet
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
    verificationCode: order.verification_code,
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
