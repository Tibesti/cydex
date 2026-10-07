import React from 'react';
import { CardContent } from '@/components/ui/card';

import OrderTrackingTimeline from './OrderTrackingTimeline';
import OrderInfoCards from './OrderInfoCards';
import DeliveryAgentCard from './DeliveryAgentCard';
import OrderItemsList from './OrderItemsList';
import OrderSummary from './OrderSummary';
import OrderActions from './OrderActions';
import HandoverCodeCard from '@/components/orders/HandoverCodeCard';
import RateRiderButton from './ratings/RateRiderButton';
import type { RiderToRate } from './ratings/RateRiderDialog';

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
    id: string;
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
  /** Set for delivered orders with a rider */
  riderToRate?: RiderToRate | null;
}

const OrderDetailsContent = ({ 
  order, 
  onCancelOrder,
  onDownloadReceipt,
  onReorder,
  riderToRate
}: OrderDetailsContentProps) => {
  return (
    <CardContent className="p-3 sm:p-4 md:p-6">
      {/* Two columns on large screens (details left, tracking right);
          one column below that, with tracking first */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:gap-6 lg:grid-cols-3">
        {/* Order tracking */}
        <aside className="order-first lg:order-last lg:col-span-1">
          <div className="lg:sticky lg:top-4">
            <OrderTrackingTimeline 
              steps={order.trackingSteps} 
              eta={order.eta} 
              status={order.status}
            />
          </div>
        </aside>

        {/* Order details */}
        <div className="min-w-0 space-y-3 sm:space-y-4 md:space-y-6 lg:col-span-2">
          {/* The code to give the rider on arrival (exists once the vendor accepts) */}
          <HandoverCodeCard orderId={order.id} kind="delivery" />

          {/* The rider, once one has the order */}
          {['rider_assigned', 'picking_up', 'out_for_delivery'].includes(order.status) && order.rider && (
            <DeliveryAgentCard rider={order.rider} status={order.status} />
          )}

          <OrderInfoCards 
            deliveryAddress={order.deliveryAddress}
            orderDate={order.orderDate}
            updatedAt={order.updatedAt}
            items={order.items}
          />

          <OrderItemsList products={order.products} />

          <OrderSummary 
            subtotal={order.subtotal}
            totalAmount={order.totalAmount}
            serviceCharge={order.serviceCharge}
            deliveryFee={order.deliveryFee}
            discount={order.discount}
            paymentMethod={order.paymentMethod || "Credit Card"}
          />

          {riderToRate && <RateRiderButton rider={riderToRate} />}

          <OrderActions 
            status={order.status}
            onCancelOrder={onCancelOrder}
            onDownloadReceipt={onDownloadReceipt}
            onReorder={onReorder}
          />
        </div>
      </div>
    </CardContent>
  );
};

export default OrderDetailsContent;
