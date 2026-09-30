import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, MapPin, Phone, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useOrderDetails } from '@/hooks/useOrderDetails';
import OrderDetailLoading from '@/components/customer/OrderDetailLoading';
import OrderNotFound from '@/components/customer/OrderNotFound';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import RiderDeliveryActions from '@/components/rider/RiderDeliveryActions';
import { RiderEarningsBreakdown } from '@/components/orders/EarningsBreakdown';
import PickupDetails from '@/components/rider/PickupDetails';

const RiderOrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { order, loading, error, refetch } = useOrderDetails(orderId || '');

  if (loading) return <OrderDetailLoading />;
  if (error || !order) return <OrderNotFound />;

  const address = (typeof order.delivery_address === 'object' ? order.delivery_address : null) as Record<string, string> | null;

  return (
    <DashboardLayout userRole="RIDER">
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/rider/current')}
            className="flex w-fit items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Deliveries</span>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Order #{order.order_number}</h1>
            <OrderStatusBadge status={order.status} className="mt-1" />
          </div>
        </div>

        {/* Next step */}
        {['rider_assigned', 'picking_up', 'out_for_delivery'].includes(order.status) && (
          <Card>
            <CardContent className="pt-6">
              <RiderDeliveryActions
                orderId={order.id}
                status={order.status}
                showPickupDetails={false}
                onChanged={() => {
                  refetch();
                }}
              />
            </CardContent>
          </Card>
        )}

        {order.status === 'delivered' && (
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <h3 className="font-medium">Delivery completed</h3>
                <p className="text-sm text-muted-foreground">Your earning has been added to your wallet.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Pickup */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                <span>Pickup</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PickupDetails orderId={order.id} className="border-0 p-0" />
            </CardContent>
          </Card>

          {/* Delivery */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                <span>Delivery</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {address ? (
                <>
                  <p className="font-medium">{address.street || address.formatted_address}</p>
                  {address.formatted_address && address.formatted_address !== address.street && (
                    <p className="text-muted-foreground">{address.formatted_address}</p>
                  )}
                  {address.additional_info && (
                    <p className="text-muted-foreground">Directions: {address.additional_info}</p>
                  )}
                  {address.phone && (
                    <a href={`tel:${address.phone}`} className="flex items-center gap-2 font-medium hover:underline">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {address.phone}
                    </a>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">{String(order.delivery_address || 'Address not available')}</p>
              )}
              {order.special_instructions && (
                <p className="rounded-md bg-muted p-2">Note: {order.special_instructions}</p>
              )}
            </CardContent>
          </Card>

          {/* Items (no prices): what to check before leaving the vendor */}
          <Card>
            <CardHeader>
              <CardTitle>Items to collect</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {order.order_items?.map((item, index) => (
                  <li key={item.id || index} className="flex items-start justify-between gap-3 rounded-lg bg-muted p-3">
                    <div>
                      <p className="font-medium">{item.product_name}</p>
                      {item.product_description && (
                        <p className="text-xs text-muted-foreground">{item.product_description}</p>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold">× {item.quantity}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Rider's money */}
          <Card>
            <CardHeader>
              <CardTitle>Your earning</CardTitle>
            </CardHeader>
            <CardContent>
              <RiderEarningsBreakdown orderId={order.id} status={order.status} paymentStatus={order.payment_status} />
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default RiderOrderDetail;
