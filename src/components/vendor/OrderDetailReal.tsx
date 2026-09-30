
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronLeft, Package, Clock, AlertCircle, User, MapPin, Phone } from 'lucide-react';
import { useVendorOrders } from '@/hooks/useVendorOrders';
import { VendorOrderAcceptance } from './VendorOrderAcceptance';
import VendorPhoneNotice from './VendorPhoneNotice';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import HandoverCodeDialog from '@/components/orders/HandoverCodeDialog';
import { VendorEarningsBreakdown } from '@/components/orders/EarningsBreakdown';
import { orderActions } from '@/services/orderActions';
import { vendorCanReject } from '@/lib/orderStatus';

const OrderDetailReal = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { orders, loading, hasPhone, acceptOrder, markReady, rejectOrder, refresh } = useVendorOrders();
  const [actionLoading, setActionLoading] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showHandover, setShowHandover] = useState(false);

  const order = orders.find(o => o.id === orderId);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
  };

  const run = async (action: () => Promise<boolean>) => {
    setActionLoading(true);
    await action();
    setActionLoading(false);
  };

  const handleReject = async () => {
    if (!order) return;
    setActionLoading(true);
    const ok = await rejectOrder(order.id, rejectReason.trim() || undefined);
    setActionLoading(false);
    if (ok) {
      setShowReject(false);
      setRejectReason('');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-64 bg-muted rounded"></div>
              <div className="h-48 bg-muted rounded"></div>
            </div>
            <div className="space-y-6">
              <div className="h-32 bg-muted rounded"></div>
              <div className="h-48 bg-muted rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Button 
          variant="outline" 
          onClick={() => navigate('/vendor/orders')} 
          className="mb-4"
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Orders
        </Button>
        
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-medium mb-4">Order not found</h2>
            <p className="text-muted-foreground mb-4">               
              The order you're looking for doesn't exist or has been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Button 
        variant="outline" 
        onClick={() => navigate('/vendor/orders')} 
        className="mb-6"
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        Back to Orders
      </Button>

      {/* Show acceptance interface for pending orders */}
      {order.status === 'pending' && !hasPhone && (
        <div className="mb-4">
          <VendorPhoneNotice />
        </div>
      )}

      {order.status === 'pending' && (
        <div className="mb-6">
          <VendorOrderAcceptance
            canAccept={hasPhone}
            order={order}
            onAccept={(id) => run(() => acceptOrder(id))}
            onReject={() => setShowReject(true)}
            loading={actionLoading}
          />
        </div>
      )}

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">Order #{order.order_number}</h1>
          <p className="text-muted-foreground">Placed on {formatDate(order.created_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <OrderStatusBadge status={order.status} />
          {order.status === 'accepted' && (
            <Button onClick={() => run(() => markReady(order.id))} disabled={actionLoading}>
              Mark Ready for Pickup
            </Button>
          )}
          {order.status === 'ready_for_pickup' && (
            <Badge variant="outline">Waiting for a rider to accept…</Badge>
          )}
          {(order.status === 'rider_assigned' || order.status === 'picking_up') && (
            <Button onClick={() => setShowHandover(true)}>Hand to rider</Button>
          )}
          {order.status !== 'pending' && vendorCanReject(order) && (
            <Button variant="outline" className="text-destructive" onClick={() => setShowReject(true)} disabled={actionLoading}>
              Reject order
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Order Items</h3>
              
              <div className="space-y-4">
                {order.order_items?.map((item, index) => (
                  <div key={index} className="flex justify-between items-center p-4 bg-muted rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium">{item.product_name}</h4>
                      {item.product_description && (
                        <p className="text-sm text-muted-foreground">{item.product_description}</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Quantity: {item.quantity} × {formatCurrency(item.unit_price)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">{formatCurrency(item.total_price)}</span>
                    </div>
                  </div>
                ))}
                
                <div className="border-t pt-4">
                  <VendorEarningsBreakdown order={order} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Delivery Information */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Delivery Information</h3>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Delivery Address</p>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {typeof order.delivery_address === 'object' ? (
                        <>
                          {/* Handle simplified address format (new campus format) */}
                          {order.delivery_address.location ? (
                            <>
                              <p className="font-medium">{order.delivery_address.location}</p>
                              {order.delivery_address.landmark && (
                                <p className="text-xs text-muted-foreground">Near {order.delivery_address.landmark}</p>
                              )}
                              {order.delivery_address.phone && (
                                <div className="flex items-center space-x-2 mt-2">
                                  <Phone className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">Contact: {order.delivery_address.phone}</span>
                                </div>
                              )}
                              {order.delivery_address.additional_info && (
                                <p className="text-xs text-blue-600 italic">Note: {order.delivery_address.additional_info}</p>
                              )}
                            </>
                          ) : (
                            /* Handle full address format (old format) */
                            <>
                              <p className="font-medium">{order.delivery_address.street || 'Address not available'}</p>
                              <p>{order.delivery_address.city}, {order.delivery_address.state}</p>
                              {order.delivery_address.landmark && (
                                <p className="text-xs text-muted-foreground">Landmark: {order.delivery_address.landmark}</p>
                              )}
                              {order.delivery_address.phone && (
                                <div className="flex items-center space-x-2 mt-2">
                                  <Phone className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">Contact: {order.delivery_address.phone}</span>
                                </div>
                              )}
                              {order.delivery_address.additional_info && (
                                <p className="text-xs text-blue-600 italic">Note: {order.delivery_address.additional_info}</p>
                              )}
                            </>
                          )}
                        </>
                      ) : (
                        <p>{order.delivery_address || 'Address not available'}</p>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Delivery Type</p>
                    <p className="text-sm text-muted-foreground capitalize">{order.delivery_type}</p>
                  </div>
                </div>
                
                {order.time_slot && (
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Time Slot</p>
                      <p className="text-sm text-muted-foreground">{order.time_slot}</p>
                    </div>
                  </div>
                )}

                {order.special_instructions && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="font-medium text-blue-900">Special Instructions</p>
                    <p className="text-sm text-blue-700">{order.special_instructions}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="space-y-6">
          {/* Rider Information */}
          {order.rider && (
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-4">Assigned Rider</h3>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{order.rider.name}</p>
                      <p className="text-sm text-muted-foreground">Delivery Rider</p>
                    </div>
                  </div>
                  
                  {order.rider.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      <a href={`tel:${order.rider.phone}`} className="text-sm underline-offset-2 hover:underline">{order.rider.phone}</a>
                    </div>
                  )}

                  {(order.status === 'rider_assigned' || order.status === 'picking_up') && (
                    <p className="text-sm text-muted-foreground">
                      When the rider arrives, tap <span className="font-medium text-foreground">Hand to rider</span> and enter the pickup code they give you.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Order Timeline */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Order Timeline</h3>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <div>
                    <p className="font-medium">Order Placed</p>
                    <p className="text-sm text-muted-foreground">{formatDate(order.created_at)}</p>
                  </div>
                </div>
                
                {order.vendor_accepted_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div>
                      <p className="font-medium">Accepted by Vendor</p>
                      <p className="text-sm text-muted-foreground">{formatDate(order.vendor_accepted_at)}</p>
                    </div>
                  </div>
                )}
                
                {order.ready_for_pickup_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div>
                      <p className="font-medium">Ready for Pickup</p>
                      <p className="text-sm text-muted-foreground">{formatDate(order.ready_for_pickup_at)}</p>
                    </div>
                  </div>
                )}

                {order.rider_assigned_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div>
                      <p className="font-medium">Rider Assigned</p>
                      <p className="text-sm text-muted-foreground">{formatDate(order.rider_assigned_at)}</p>
                    </div>
                  </div>
                )}

                {order.picked_up_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div>
                      <p className="font-medium">Picked Up</p>
                      <p className="text-sm text-muted-foreground">{formatDate(order.picked_up_at)}</p>
                    </div>
                  </div>
                )}
                
                {order.delivered_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div>
                      <p className="font-medium">Delivered</p>
                      <p className="text-sm text-muted-foreground">{formatDate(order.delivered_at)}</p>
                    </div>
                  </div>
                )}
                
                {order.cancelled_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <div>
                      <p className="font-medium">{order.status === 'rejected' ? 'Rejected' : 'Cancelled'}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(order.cancelled_at)}</p>
                      {order.cancel_reason && (
                        <p className="text-sm text-red-600">Reason: {order.cancel_reason}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={showReject} onOpenChange={(open) => !actionLoading && setShowReject(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject order #{order.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The customer will be notified and refunded to their Cydex wallet. You can only reject an order before a rider accepts it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason (shown to the customer), e.g. Out of stock"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={200}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Keep order</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleReject(); }}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HandoverCodeDialog
        open={showHandover}
        onOpenChange={setShowHandover}
        title="Hand order to rider"
        description="Ask the rider for their 4-digit pickup code."
        confirmLabel="Confirm pickup"
        onSubmit={(code) => orderActions.confirmPickup(order.id, code)}
        onConfirmed={() => refresh()}
      />
    </div>
  );
};

export default OrderDetailReal;
