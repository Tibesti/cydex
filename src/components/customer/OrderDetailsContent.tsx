import React, { useState } from 'react';
import { BellRing, Bike, Loader2, MapPin, Package, User } from 'lucide-react';
import { CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import OrderTrackingTimeline from './OrderTrackingTimeline';
import OrderInfoCards from './OrderInfoCards';
import DeliveryAgentCard from './DeliveryAgentCard';
import OrderItemsList from './OrderItemsList';
import OrderSummary from './OrderSummary';
import OrderActions from './OrderActions';
import HandoverCodeCard from '@/components/orders/HandoverCodeCard';
import HandoverCodeDialog from '@/components/orders/HandoverCodeDialog';
import RateRiderButton from './ratings/RateRiderButton';
import type { RiderToRate } from './ratings/RateRiderDialog';
import { RIDER_ACTIVE_STATUSES, type OrderStatus } from '@/lib/orderStatus';
import { orderActions } from '@/services/orderActions';

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
    eta?: string;
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
    /** Promotion or coupon taken off, if any */
    discount?: string | null;
    /** What their wallet paid, if anything */
    walletPaid?: string | null;
    /** Still to pay by card or transfer (unpaid orders) */
    amountDue?: string | null;
    paymentMethod?: string;
    riderName?: string;
    verificationCode?: string;
    orderNumber?: string;
    canCancel?: boolean;
    /** Preferred delivery mode, as the customer sees it */
    deliveryMode?: string | null;
    modeWidened?: boolean;
    /** Cydex Express: their own item, from a pickup point to someone else */
    express?: {
      pickupAddress: string;
      recipientName: string;
      recipientPhone: string;
      recipientEmail: string;
      packageDetails: string;
    } | null;
  };
  onCancelOrder: () => void;
  onDownloadReceipt: () => void;
  onReorder: () => void;
  /** Set while the order still has something to pay by card */
  onPay?: () => void;
  paying?: boolean;
  onChanged?: () => void;
  /** Set for delivered orders with a rider */
  riderToRate?: RiderToRate | null;
}

const OrderDetailsContent = ({ 
  order, 
  onCancelOrder,
  onDownloadReceipt,
  onReorder,
  onPay,
  paying,
  onChanged,
  riderToRate
}: OrderDetailsContentProps) => {
  const [enteringPickupCode, setEnteringPickupCode] = useState(false);
  const express = order.express;
  const riderHasIt = RIDER_ACTIVE_STATUSES.includes(order.status as OrderStatus);

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
          {/* Wallet covered part of it (or none): the rest is still to pay */}
          {onPay && (
            <div className="flex flex-col gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-medium">Payment not completed</p>
                <p className="text-muted-foreground">
                  {order.walletPaid ? `${order.walletPaid} came from your wallet. ` : ''}
                  {order.amountDue} left to pay. {order.walletPaid ? 'If you don’t pay within 30 minutes, the wallet amount goes back to your wallet.' : ''}
                </p>
              </div>
              <Button onClick={onPay} disabled={paying} className="shrink-0 text-black">
                {paying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Pay {order.amountDue}
              </Button>
            </div>
          )}

          {/* The rider tapped "I've arrived" */}
          {order.status === 'arrived' && (
            <div role="status" className="flex items-start gap-3 rounded-lg border border-primary bg-primary/15 p-4">
              <BellRing className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="text-sm">
                <p className="text-base font-semibold">Your rider is around</p>
                <p className="text-muted-foreground">
                  {express
                    ? `The rider is at the drop-off. ${express.recipientName || 'The recipient'} gives them the delivery code below once they have the item.`
                    : 'Meet your rider and give them the delivery code below once you have your order.'}
                </p>
              </div>
            </div>
          )}

          {/* Cydex Express: hand the item to the rider by entering their pickup code */}
          {express && ['rider_assigned', 'picking_up'].includes(order.status) && (
            <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-medium">Handing over your item</p>
                <p className="text-muted-foreground">
                  When the rider gets to you, ask for their pickup code and enter it here before you give them the item.
                </p>
              </div>
              <Button onClick={() => setEnteringPickupCode(true)} className="shrink-0 text-black">Enter pickup code</Button>
            </div>
          )}

          {/* The code to give the rider on arrival (exists once the vendor accepts) */}
          <HandoverCodeCard
            orderId={order.id}
            kind="delivery"
            hint={express
              ? `Share this code with ${express.recipientName || 'the recipient'}. They give it to the rider only once they have the item. We've emailed it to them too.`
              : undefined}
          />

          {/* The rider, once one has the order */}
          {riderHasIt && order.rider && (
            <DeliveryAgentCard rider={order.rider} status={order.status} express={!!express} />
          )}

          {order.deliveryMode && !['delivered', 'cancelled', 'rejected'].includes(order.status) && (
            <div className="flex items-start gap-2 rounded-lg border p-3 text-sm sm:p-4">
              <Bike className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p><span className="text-muted-foreground">Preferred delivery mode:</span> <span className="font-medium">{order.deliveryMode}</span></p>
                {order.modeWidened && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    No {order.deliveryMode} rider picked this up in time, so we've offered it to our other delivery partners too.
                  </p>
                )}
              </div>
            </div>
          )}

          {express ? (
            <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-3 sm:p-4">
                <h3 className="mb-2 flex items-center text-sm font-medium sm:text-base">
                  <MapPin className="mr-2 h-4 w-4 shrink-0 sm:h-5 sm:w-5" /> Pickup
                </h3>
                <p className="text-sm text-muted-foreground">{express.pickupAddress}</p>
              </div>
              <div className="rounded-lg border p-3 sm:p-4">
                <h3 className="mb-2 flex items-center text-sm font-medium sm:text-base">
                  <MapPin className="mr-2 h-4 w-4 shrink-0 sm:h-5 sm:w-5" /> Drop-off
                </h3>
                <p className="text-sm text-muted-foreground">{order.deliveryAddress}</p>
              </div>
              <div className="rounded-lg border p-3 sm:p-4">
                <h3 className="mb-2 flex items-center text-sm font-medium sm:text-base">
                  <User className="mr-2 h-4 w-4 shrink-0 sm:h-5 sm:w-5" /> Recipient
                </h3>
                <div className="space-y-0.5 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{express.recipientName}</p>
                  {express.recipientPhone && <p><a href={`tel:${express.recipientPhone}`} className="hover:underline">{express.recipientPhone}</a></p>}
                  {express.recipientEmail && <p className="break-all">{express.recipientEmail}</p>}
                </div>
              </div>
              <div className="rounded-lg border p-3 sm:p-4">
                <h3 className="mb-2 flex items-center text-sm font-medium sm:text-base">
                  <Package className="mr-2 h-4 w-4 shrink-0 sm:h-5 sm:w-5" /> What you're sending
                </h3>
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{express.packageDetails}</p>
                <p className="mt-2 text-xs text-muted-foreground">Booked {order.orderDate}</p>
              </div>
            </div>
          ) : (
            <>
              <OrderInfoCards 
                deliveryAddress={order.deliveryAddress}
                orderDate={order.orderDate}
                updatedAt={order.updatedAt}
                items={order.items}
              />

              <OrderItemsList products={order.products} />
            </>
          )}

          <OrderSummary 
            subtotal={express ? null : order.subtotal}
            totalAmount={order.totalAmount}
            serviceCharge={order.serviceCharge}
            deliveryFee={order.deliveryFee}
            discount={order.discount}
            walletPaid={order.walletPaid}
            paymentMethod={order.paymentMethod || "Card"}
          />

          {riderToRate && <RateRiderButton rider={riderToRate} />}

          <OrderActions 
            status={order.status}
            canCancel={order.canCancel}
            express={!!express}
            onCancelOrder={onCancelOrder}
            onDownloadReceipt={onDownloadReceipt}
            onReorder={express ? undefined : onReorder}
          />
        </div>
      </div>

      {express && (
        <HandoverCodeDialog
          open={enteringPickupCode}
          onOpenChange={setEnteringPickupCode}
          title="Enter the rider's pickup code"
          description="Ask the rider for the 4-digit pickup code in their app. Entering it confirms they are your rider and that they have collected the item."
          confirmLabel="Confirm handover"
          onSubmit={(code) => orderActions.senderConfirmPickup(order.id, code)}
          onConfirmed={onChanged}
        />
      )}
    </CardContent>
  );
};

export default OrderDetailsContent;
