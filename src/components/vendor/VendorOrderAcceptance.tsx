import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Package, MapPin, User, CheckCircle, X } from 'lucide-react';
import type { VendorOrder } from '@/hooks/useVendorOrders';

interface VendorOrderAcceptanceProps {
  order: VendorOrder;
  onAccept: (orderId: string) => void;
  onReject: (orderId: string, reason: string) => void;
  loading?: boolean;
  /** False while the vendor has no phone number on their profile */
  canAccept?: boolean;
}

export const VendorOrderAcceptance: React.FC<VendorOrderAcceptanceProps> = ({
  order,
  onAccept,
  onReject,
  loading = false,
  canAccept = true
}) => {
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

  if (order.status !== 'pending') {
    return null;
  }

  return (
    <Card className="border-l-4 border-l-orange-500">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-500" />
            New Order Request
          </CardTitle>
          <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
            Pending Approval
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Order Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Order placed: {formatDate(order.created_at)}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-medium">{order.customer?.name}</span>
                {order.customer?.phone && <span className="text-muted-foreground"> • {order.customer.phone}</span>}
              </span>
            </div>
            
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="text-sm">
                <div className="font-medium">Delivery Address:</div>
                <div className="text-muted-foreground">
                  {order.delivery_address?.street}, {order.delivery_address?.city}
                  {order.delivery_address?.state && `, ${order.delivery_address.state}`}
                </div>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="space-y-3">
            <div className="bg-muted rounded-lg p-3">
              <div className="text-sm font-medium mb-2">Order Summary:</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Items ({order.order_items?.length || 0}):</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Paid. Cydex's commission is taken from the items total; see the breakdown below.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">Order items</span>
            <span className="text-xs text-muted-foreground">
              {order.order_items?.length || 0} {order.order_items?.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border bg-muted/40">
            {order.order_items?.map((item, index) => (
              <li key={index} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 px-1.5 text-xs font-semibold text-foreground">
                  {item.quantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{item.product_name}</p>
                  {item.quantity > 1 && (
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.unit_price)} each</p>
                  )}
                </div>
                <span className="shrink-0 font-medium text-foreground">{formatCurrency(item.total_price)}</span>
              </li>
            ))}
          </ul>
        </div>

        {order.special_instructions && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
            <div className="mb-1 text-sm font-medium text-blue-900 dark:text-blue-200">Special Instructions:</div>
            <div className="text-sm text-blue-700 dark:text-blue-300">{order.special_instructions}</div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            onClick={() => onAccept(order.id)}
            disabled={loading || !canAccept}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Accept Order
          </Button>
          
          <Button
            onClick={() => onReject(order.id, 'Order rejected by vendor')}
            disabled={loading}
            variant="outline"
            className="flex-1 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <X className="h-4 w-4 mr-2" />
            Reject Order
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};