
import React, { useState } from 'react';
import { useHasPhone } from '@/hooks/useHasPhone';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Package, AlertCircle, Eye } from 'lucide-react';
import { DeliveryData } from '@/hooks/useRiderData';
import { OrderDetailModal } from '@/components/rider/OrderDetailModal';
import { useRiderLocation } from '@/hooks/useRiderLocation';
import { formatKm, pickupDistanceKm } from '@/lib/riderLocation';

interface OrderCardProps {
  order: DeliveryData;
  onAcceptOrder: (orderId: string) => void;
  loading?: boolean;
}

export const OrderCard: React.FC<OrderCardProps> = ({ 
  order, 
  onAcceptOrder, 
  loading = false 
}) => {
  // Riders need a phone number on their profile to accept deliveries
  const hasPhone = useHasPhone();
  const { position } = useRiderLocation();
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const totalEarnings = Number(order.rider_earning ?? 0); // Rider's share of the delivery fee
  const hasCarbonSavings = Number(order.carbon_saved) > 0;

  return (
    <>
      <div className="bg-card border-border border rounded-lg p-4 hover:shadow-md transition-all duration-200 hover:border-primary/30">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <div className="flex-shrink-0 p-2 bg-blue-50 dark:bg-blue-500/15 rounded-full">
              <Package className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2">
                <h3 className="font-medium text-sm text-foreground truncate">
                  {order.vendor_name}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                → {order.customer_name}
              </p>
              <div className="flex items-center mt-1 text-xs text-muted-foreground">
                <span>Order #{order.order_id.slice(0, 8)}</span>
                <span className="mx-2">•</span>
                <span>{order.items_count} item{order.items_count !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Delivery Details */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="space-y-2">
            <div className="flex items-center text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 mr-1.5" />
              <span>{formatKm(pickupDistanceKm(order.pickup_location, position))}</span>
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              <Clock className="h-3 w-3 mr-1.5" />
              <span>
                Pickup: {new Date(order.estimated_pickup_time).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-lg font-bold text-foreground">
              ₦{totalEarnings.toLocaleString('en-NG', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="flex flex-wrap gap-2 mb-3">
          {hasCarbonSavings && (
            <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30">
              {Number(order.carbon_saved).toFixed(1)} kg CO₂ saved
            </Badge>
          )}
          {order.special_instructions && (
            <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30">
              <AlertCircle className="h-3 w-3 mr-1" />
              Special instructions
            </Badge>
          )}
        </div>

        {/* Delivery Time */}
        <div className="text-xs text-muted-foreground mb-3">
          Est. delivery: {new Date(order.estimated_delivery_time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={() => setIsDetailModalOpen(true)}
            variant="outline"
            className="flex-1 text-xs h-8"
          >
            <Eye className="h-3 w-3 mr-1" />
            View Details
          </Button>
          <Button
            onClick={() => onAcceptOrder(order.id)}
            disabled={loading || !hasPhone}
            title={hasPhone ? undefined : 'Add a phone number to your profile first'}
            className="flex-1 bg-primary hover:bg-primary/90 text-black font-medium text-xs h-8"
            aria-label={`Accept delivery order from ${order.vendor_name} to ${order.customer_name}`}
          >
            {loading ? 'Accepting...' : 'Accept Order'}
          </Button>
        </div>
      </div>

      {/* Order Detail Modal */}
      <OrderDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        order={order}
        onAcceptOrder={onAcceptOrder}
        loading={loading}
      />
    </>
  );
};
