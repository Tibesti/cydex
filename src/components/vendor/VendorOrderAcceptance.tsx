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
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
            Pending Approval
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Order Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">
                Order placed: {formatDate(order.created_at)}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500" />
              <span className="text-sm">
                <span className="font-medium">{order.customer?.name}</span>
                {order.customer?.phone && <span className="text-muted-foreground"> • {order.customer.phone}</span>}
              </span>
            </div>
            
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">Delivery Address:</div>
                <div className="text-gray-600">
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
          <div className="font-medium text-sm">Order Items:</div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {order.order_items?.map((item, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                <div>
                  <span className="font-medium">{item.product_name}</span>
                  <span className="text-gray-600 ml-2">× {item.quantity}</span>
                </div>
                <span>{formatCurrency(item.total_price)}</span>
              </div>
            ))}
          </div>
        </div>

        {order.special_instructions && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="font-medium text-blue-900 text-sm mb-1">Special Instructions:</div>
            <div className="text-blue-700 text-sm">{order.special_instructions}</div>
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
            className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
          >
            <X className="h-4 w-4 mr-2" />
            Reject Order
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};