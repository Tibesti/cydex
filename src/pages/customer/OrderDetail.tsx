import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardHeader } from '@/components/ui/card';
import { toast } from 'sonner';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCartContext } from '@/contexts/CartContext';
import { orderActions } from '@/services/orderActions';
import { isAvailable, stockLimit } from '@/lib/products';
import { errorMessage } from '@/lib/address';
import { invokeFunction } from '@/lib/edgeFunctions';
import { supabase as typedSupabase } from '@/integrations/supabase/client';
import { etaText } from '@/lib/deliveryModes';
import { CLOSED_STATUSES, customerCanCancel, type OrderStatus } from '@/lib/orderStatus';
import { useVehicleTypes } from '@/hooks/useVehicleTypes';

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
  const express = order.order_type === 'express';
  const around = { id: 8, title: 'Rider is around', completed: reached(['arrived', 'delivered']),
    time: timeOf(order.arrived_at),
    description: express ? 'The rider is at the drop-off' : 'Your rider is nearby. Have your delivery code ready.' };

  // Cydex Express: no vendor, the rider collects from the customer
  const steps = express ? [
    { id: 1, title: 'Delivery booked', completed: true, time: timeOf(order.created_at),
      description: 'Your delivery has been booked' },
    { id: 2, title: 'Payment confirmed', completed: paid, time: null,
      description: paid ? 'Payment received. Finding a rider near the pickup point.' : 'Waiting for payment' },
    { id: 5, title: 'Rider assigned',
      completed: reached(['rider_assigned', 'picking_up', 'out_for_delivery', 'arrived', 'delivered']),
      time: timeOf(order.rider_assigned_at), description: 'A rider accepted your delivery' },
    { id: 6, title: 'Rider heading to pickup',
      completed: reached(['picking_up', 'out_for_delivery', 'arrived', 'delivered']),
      time: null, description: 'Your rider is on the way to collect the item' },
    { id: 7, title: 'Item collected',
      completed: reached(['out_for_delivery', 'arrived', 'delivered']),
      time: timeOf(order.picked_up_at), description: 'Your rider has the item and is on the way to the drop-off' },
    around,
    { id: 9, title: 'Delivered', completed: order.status === 'delivered',
      time: timeOf(order.delivered_at), description: 'Item delivered' },
  ] : [
    { id: 1, title: 'Order placed', completed: true, time: timeOf(order.created_at),
      description: 'Your order has been placed' },
    { id: 2, title: 'Payment confirmed', completed: paid, time: null,
      description: paid ? 'Payment received. Waiting for the vendor to accept.' : 'Waiting for payment confirmation' },
    { id: 3, title: 'Vendor accepted',
      completed: reached(['accepted', 'ready_for_pickup', 'rider_assigned', 'picking_up', 'out_for_delivery', 'arrived', 'delivered']),
      time: timeOf(order.vendor_accepted_at), description: 'The vendor is preparing your order' },
    { id: 4, title: 'Ready for pickup',
      completed: reached(['ready_for_pickup', 'rider_assigned', 'picking_up', 'out_for_delivery', 'arrived', 'delivered']),
      time: timeOf(order.ready_for_pickup_at), description: 'Finding a rider near the vendor' },
    { id: 5, title: 'Rider assigned',
      completed: reached(['rider_assigned', 'picking_up', 'out_for_delivery', 'arrived', 'delivered']),
      time: timeOf(order.rider_assigned_at), description: 'A rider accepted your order' },
    { id: 6, title: 'Rider heading to vendor',
      completed: reached(['picking_up', 'out_for_delivery', 'arrived', 'delivered']),
      time: null, description: 'Your rider is on the way to collect your order' },
    { id: 7, title: 'Out for delivery',
      completed: reached(['out_for_delivery', 'arrived', 'delivered']),
      time: timeOf(order.picked_up_at), description: 'Your rider has your order and is on the way' },
    around,
    { id: 9, title: 'Delivered', completed: order.status === 'delivered',
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

// One line of an address snapshot (delivery_address / pickup_address)
const addressLine = (value: unknown): string => {
  if (!value) return '';
  if (typeof value !== 'object') return String(value);
  const a = value as Record<string, string | undefined>;
  return a.formatted_address || a.location || [a.street, a.city, a.state].filter(Boolean).join(', ');
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { labelOf } = useVehicleTypes();
  const [paying, setPaying] = useState(false);
  const express = order?.order_type === 'express';

  // Back from a card payment (Squad adds ?transaction_ref=...): have the
  // server confirm it, which marks the order paid
  const verified = useRef(false);
  useEffect(() => {
    const ref = searchParams.get('transaction_ref') || searchParams.get('reference');
    if (!ref || verified.current) return;
    verified.current = true;
    invokeFunction<{ status: string }>('squad-checkout', { action: 'verify', transaction_ref: ref })
      .then((result) => {
        if (result.status === 'paid') toast.success('Payment received');
        else toast.info('We haven’t received your payment yet. It can take a minute to show.');
      })
      .catch((e) => toast.error(errorMessage(e, 'Could not confirm the payment')))
      .finally(() => {
        setSearchParams({}, { replace: true });
        refetch();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Time estimate from real deliveries with this delivery mode (delivery_eta)
  const etaMode = order?.rider_vehicle_type || order?.preferred_vehicle_type;
  const { data: eta } = useQuery({
    queryKey: ['order-eta', order?.id, etaMode, order?.distance_km],
    enabled: !!order && !!etaMode && order.distance_km != null && !CLOSED_STATUSES.includes(order.status as OrderStatus),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      let prep = 0;
      if (order!.vendor_id && order!.order_type !== 'express') {
        const { data: hours } = await typedSupabase.rpc('vendor_hours_info', { p_vendor_ids: [order!.vendor_id] });
        prep = Number((hours as { prep_time_minutes?: number }[] | null)?.[0]?.prep_time_minutes ?? 0);
      }
      const { data, error } = await typedSupabase.rpc('delivery_eta', {
        p_vehicle_type: etaMode!, p_distance_km: Number(order!.distance_km), p_prep_minutes: prep,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  // Pay what the wallet didn't cover
  const handlePay = async () => {
    if (!order) return;
    setPaying(true);
    try {
      const { checkout_url } = await invokeFunction<{ checkout_url: string }>('squad-checkout', {
        action: 'initiate', order_number: order.order_number,
      });
      window.location.href = checkout_url;
    } catch (e) {
      toast.error(errorMessage(e, 'Could not start the payment. Please try again.'));
      setPaying(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    try {
      await orderActions.cancel(order.id, 'Cancelled by customer');
      toast.success(
        order.payment_status === 'paid'
          ? `${express ? 'Delivery' : 'Order'} cancelled. Your payment has been refunded to your wallet.`
          : `${express ? 'Delivery' : 'Order'} cancelled`,
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

  // Adds the order's products back to the cart at today's prices, skipping
  // anything no longer available and capping stock-tracked items
  const handleReorder = async () => {
    if (!order?.order_items?.length) {
      toast.error('No items found in this order');
      return;
    }

    try {
      const { data: lines } = await supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', order.id);
      const productIds = [...new Set((lines ?? []).map((l) => l.product_id).filter(Boolean))] as string[];
      const { data: products } = productIds.length
        ? await supabase.from('products').select('id, name, price, vendor_id, status, track_stock, stock_quantity').in('id', productIds)
        : { data: [] };

      const available = (products ?? []).filter((p) => isAvailable(p));
      if (available.length === 0) {
        toast.error('None of these products are available right now');
        return;
      }

      clearCart();
      for (const product of available) {
        const quantity = (lines ?? []).filter((l) => l.product_id === product.id).reduce((n, l) => n + l.quantity, 0);
        addToCart({
          id: product.id,
          name: product.name,
          price: Number(product.price),
          vendor_id: product.vendor_id,
          vendor_name: order.vendor?.name || 'Unknown Vendor',
          max_quantity: stockLimit(product),
        }, quantity);
      }

      const skipped = productIds.length - available.length;
      if (skipped > 0) toast.info(`${skipped} item${skipped === 1 ? ' is' : 's are'} no longer available and weren't added`);
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

  const deliveryAddressStr = addressLine(order.delivery_address);
  const unpaid = order.payment_status === 'pending' && order.status === 'pending';
  const walletPaid = Number(order.wallet_amount ?? 0);
  const discount = Number(order.discount_amount ?? 0);

  // "About 20 min" before pickup; a clock time once the rider has the order
  const etaLabel = !eta?.eta_min || order.status === 'arrived' ? undefined
    : order.status === 'out_for_delivery' && order.picked_up_at
      ? `Around ${timeOf(new Date(new Date(order.picked_up_at).getTime() + eta.eta_min * 60_000).toISOString())}`
      : etaText(eta.eta_min, eta.eta_max);

  // Transform order data to match component expectations
  const transformedOrder = {
    id: order.id,
    vendor: express ? 'Cydex Express' : order.vendor?.name || 'Vendor',
    status: order.status,
    paymentStatus: order.payment_status,
    trackingSteps: generateTrackingSteps(order),
    eta: etaLabel,
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
    discount: discount > 0 ? formatCurrency(discount) : null,
    walletPaid: walletPaid > 0 ? formatCurrency(walletPaid) : null,
    amountDue: unpaid ? formatCurrency(Math.max(Number(order.total_amount) - walletPaid, 0)) : null,
    // Normalize payment method label - default to generic 'Card' instead of legacy 'Paystack'
    paymentMethod: order.payment_method === 'wallet' ? 'Cydex wallet' : order.payment_method || 'Card',
    orderNumber: order.order_number,
    canCancel: customerCanCancel(order.status, order),
    deliveryMode: order.preferred_vehicle_type ? labelOf(order.preferred_vehicle_type) : null,
    // The preferred mode had no taker in time, so it was offered to everyone
    modeWidened: !!order.mode_widened_at,
    express: express ? {
      pickupAddress: addressLine(order.pickup_address),
      recipientName: order.delivery_address?.name ?? '',
      recipientPhone: order.delivery_address?.phone ?? '',
      recipientEmail: order.delivery_address?.email ?? '',
      packageDetails: order.special_instructions ?? '',
    } : null,
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
             onPay={unpaid ? handlePay : undefined}
             paying={paying}
             onChanged={refetch}
             riderToRate={order.status === 'delivered' && order.rider_id ? {
               orderId: order.id,
               orderNumber: order.order_number,
               riderId: order.rider_id,
               riderName: order.rider?.name ?? null,
               riderAvatar: order.rider?.avatar ?? null,
             } : null}
           />
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default OrderDetailPage;
