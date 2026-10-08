
import React, { useState } from 'react';
import { useHasPhone } from '@/hooks/useHasPhone';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Clock, MapPin, AlertCircle, Eye } from 'lucide-react';
import { DeliveryData } from '@/hooks/useRiderData';
import { OrderDetailModal } from '@/components/rider/OrderDetailModal';
import { formatNaira } from '@/lib/pricing';
import { useRiderLocation } from '@/hooks/useRiderLocation';
import { formatKm, pickupDistanceKm } from '@/lib/riderLocation';

interface OrdersTableProps {
  orders: DeliveryData[];
  onAcceptOrder: (orderId: string) => void;
  loading?: boolean;
  error?: string | null;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({ 
  orders, 
  onAcceptOrder, 
  loading = false,
  error = null 
}) => {
  // Riders need a phone number on their profile to accept deliveries
  const hasPhone = useHasPhone();
  const { position } = useRiderLocation();
  const [selectedOrder, setSelectedOrder] = useState<DeliveryData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const handleViewDetails = (order: DeliveryData) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsDetailModalOpen(false);
    setSelectedOrder(null);
  };
  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading available orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-red-500 dark:text-red-400 mx-auto" />
          <div>
            <h3 className="font-medium text-foreground mb-1">Error Loading Orders</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Package className="h-12 w-12 mx-auto text-muted-foreground" />
          <div>
            <h3 className="font-medium text-foreground mb-1">No Available Orders</h3>
            <p className="text-sm text-muted-foreground">Check back later for new delivery opportunities</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                scope="col"
              >
                Order Details
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                scope="col"
              >
                Location & Distance
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                scope="col"
              >
                Timing
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                scope="col"
              >
                Earnings
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                scope="col"
              >
                Action
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-muted transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {order.vendor_name}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        To: {order.customer_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.items_count} item{order.items_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-1">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">
                      {formatKm(pickupDistanceKm(order.pickup_location, position))}
                    </span>
                  </div>
                  {order.special_instructions && (
                    <Badge variant="outline" className="mt-1 text-xs">
                      Special instructions
                    </Badge>
                  )}
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1 text-sm text-foreground">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {new Date(order.estimated_pickup_time).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Est. delivery: {new Date(order.estimated_delivery_time).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {formatNaira(Number(order.rider_earning ?? 0))}
                    </p>
                    {Number(order.carbon_saved) > 0 && (
                      <p className="text-xs text-green-500 dark:text-green-400">
                        {Number(order.carbon_saved).toFixed(1)} kg CO₂ saved
                      </p>
                    )}
                  </div>
                </td>
                
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleViewDetails(order)}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                    <Button
                      onClick={() => onAcceptOrder(order.id)}
                      disabled={!hasPhone}
                      title={hasPhone ? undefined : 'Add a phone number to your profile first'}
                      className="bg-primary hover:bg-primary/90 text-black font-medium text-xs"
                      size="sm"
                      aria-label={`Accept delivery order from ${order.vendor_name}`}
                    >
                      Accept
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleCloseModal}
          order={selectedOrder}
          onAcceptOrder={onAcceptOrder}
        />
      )}
    </div>
  );
};
