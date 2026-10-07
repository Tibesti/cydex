
import React from 'react';
import { useHasPhone } from '@/hooks/useHasPhone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Clock } from 'lucide-react';
import { DeliveryData } from '@/hooks/useRiderData';
import { formatNaira } from '@/lib/pricing';
import { useRiderLocation } from '@/hooks/useRiderLocation';
import { formatKm, pickupDistanceKm } from '@/lib/riderLocation';

interface AvailableOrdersListProps {
  availableDeliveries: DeliveryData[];
  onAcceptOrder: (orderId: string) => void;
}

export const AvailableOrdersList: React.FC<AvailableOrdersListProps> = ({
  availableDeliveries,
  onAcceptOrder
}) => {
  // Riders need a phone number on their profile to accept deliveries
  const hasPhone = useHasPhone();
  const { position } = useRiderLocation();

  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg">Available Orders</CardTitle>
        <CardDescription className="text-sm">Choose your next eco-friendly delivery</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3 sm:space-y-4">
          {availableDeliveries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No available orders at the moment</p>
            </div>
          ) : (
            availableDeliveries.slice(0, 5).map((order) => (
              <div key={order.id} className="bg-card border-border border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row justify-between">
                  <div className="flex items-start space-x-3 sm:space-x-4">
                    <div className="p-1.5 sm:p-2 bg-blue-100 rounded-full flex-shrink-0">
                      <Package className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center flex-wrap gap-1 sm:gap-0">
                        <h3 className="font-medium text-sm sm:text-base truncate">
                          Order from {order.vendor_name}
                        </h3>
                        <span className="mx-2 text-gray-300 hidden sm:inline">•</span>
                        <span className="text-xs sm:text-sm text-gray-500">Deliver to {order.customer_name}</span>
                      </div>
                      <div className="flex items-center mt-1 flex-wrap gap-2">
                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 text-xs">
                          {formatKm(pickupDistanceKm(order.pickup_location, position))}
                        </Badge>
                        <div className="flex items-center text-xs sm:text-sm text-gray-600">
                          <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                          <span>Pickup: {new Date(order.estimated_pickup_time).toLocaleTimeString()}</span>
                        </div>
                      </div>
                      <div className="mt-1 text-xs sm:text-sm text-gray-600">
                        <span>{order.items_count} items</span>
                        <span className="mx-2 text-gray-300">•</span>
                        <span>Est. delivery: {new Date(order.estimated_delivery_time).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-start sm:items-end justify-between mt-3 sm:mt-0 sm:ml-4">
                    <div className="text-left sm:text-right">
                      <div className="text-base sm:text-lg font-bold">
                        {formatNaira(Number(order.rider_earning ?? 0))}
                      </div>
                    </div>
                    <Button 
                      className="mt-2 bg-primary hover:bg-primary-hover text-black text-xs sm:text-sm h-7 sm:h-8"
                      onClick={() => onAcceptOrder(order.id)}
                      disabled={!hasPhone}
                      title={hasPhone ? undefined : 'Add a phone number to your profile first'}
                    >
                      Accept Order
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
