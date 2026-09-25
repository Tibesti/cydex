import React from 'react';
import { CardContent } from '@/components/ui/card';

import OrderTrackingTimeline from './OrderTrackingTimeline';
import OrderInfoCards from './OrderInfoCards';
import DeliveryAgentCard from './DeliveryAgentCard';
import OrderItemsList from './OrderItemsList';
import OrderSummary from './OrderSummary';
import OrderActions from './OrderActions';

// Define interfaces
interface TrackingStep {
  id: number;
  title: string;
  completed: boolean;
  time: string | null;
}

interface OrderProduct {
  id: string;
  name: string;
  quantity: number;
  price: string;
  image: string | null;
}

interface OrderDetailsContentProps {
  order: {
    trackingSteps: TrackingStep[];
    eta: string;
    status: string;
    deliveryAddress: string;
    orderDate: string;
    updatedAt: string;
    items: number;
    rider?: {
      name: string;
      phone: string;
      rating: number;
      photo: string | null;
    };
    products: OrderProduct[];
    subtotal: string;
    totalAmount: string;
    serviceCharge: string;
    deliveryFee: string;
    discount: string;
    paymentMethod?: string;
    riderName?: string;
    verificationCode?: string;
    orderNumber?: string;
  };
  onCancelOrder: () => void;
  onDownloadReceipt: () => void;
  onReorder: () => void;
}

const OrderDetailsContent = ({ 
  order, 
  onCancelOrder,
  onDownloadReceipt,
  onReorder
}: OrderDetailsContentProps) => {
  return (
    <CardContent className="space-y-3 sm:space-y-4 md:space-y-6 p-3 sm:p-4 md:p-6">
      {/* Order Timeline */}
      <OrderTrackingTimeline 
        steps={order.trackingSteps} 
        eta={order.eta} 
        status={order.status}
        verificationCode={order.verificationCode}
        orderNumber={order.orderNumber}
        riderName={order.riderName}
      />

      {/* Order Info */}
      <OrderInfoCards 
        deliveryAddress={order.deliveryAddress}
        orderDate={order.orderDate}
        updatedAt={order.updatedAt}
        items={order.items}
      />

      {/* Rider Info (if in transit) */}
      {order.status === 'out_for_delivery' && order.rider && (
        <DeliveryAgentCard rider={order.rider} />
      )}

      {/* Order Items */}
      <OrderItemsList products={order.products} />

      {/* Order Summary */}
      <OrderSummary 
        subtotal={order.subtotal}
        totalAmount={order.totalAmount}
        serviceCharge={order.serviceCharge}
        deliveryFee={order.deliveryFee}
        discount={order.discount}
        paymentMethod={order.paymentMethod || "Credit Card"}
      />

      {/* Action Buttons */}
      <OrderActions 
        status={order.status}
        onCancelOrder={onCancelOrder}
        onDownloadReceipt={onDownloadReceipt}
        onReorder={onReorder}
      />
    </CardContent>
  );
};

export default OrderDetailsContent;
