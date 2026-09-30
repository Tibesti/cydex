import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, MapPin, Clock, User, Navigation, Leaf } from 'lucide-react';
import { DeliveryData } from '@/hooks/useRiderData';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import RiderDeliveryActions from '@/components/rider/RiderDeliveryActions';
import { orderStatusForDelivery } from '@/lib/orderStatus';

interface CurrentDeliveryCardProps {
  currentDeliveries: DeliveryData[];
  onChanged?: () => void;
}

export const CurrentDeliveryCard: React.FC<CurrentDeliveryCardProps> = ({
  currentDeliveries,
  onChanged
}) => {
  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-4">
        <CardTitle className="text-base sm:text-lg">Current Deliveries</CardTitle>
        <CardDescription className="text-sm">Manage your active deliveries</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3 sm:space-y-4">
          {currentDeliveries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No active deliveries</p>
            </div>
          ) : (
            currentDeliveries.map((delivery) => (
              <div key={delivery.id}>
                  <div className="bg-card border-border border rounded-lg p-3 sm:p-4">
                    <div className="flex flex-col space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="h-5 w-5 text-blue-600" />
                          <span className="font-medium text-sm sm:text-base">
                            Order #{delivery.order?.order_number ?? delivery.order_id.slice(0, 8)}
                          </span>
                        </div>
                        <OrderStatusBadge status={orderStatusForDelivery(delivery.status)} className="text-xs" />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-500" />
                          <span>Customer: {delivery.customer_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-500" />
                          <span>Vendor: {delivery.vendor_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-gray-500" />
                          <span>Est. Delivery: {new Date(delivery.estimated_delivery_time).toLocaleTimeString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Navigation className="h-4 w-4 text-gray-500" />
                          <span>{Number(delivery.actual_distance || 2.5).toFixed(1)} km</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-4">
                          <div className="text-sm">
                            <span className="font-medium">
                              ₦{Number(delivery.rider_earning ?? 0).toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </span>
                          </div>
                          <div className="flex items-center text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                            <Leaf className="h-3 w-3 mr-1" />
                            <span>{Number(delivery.carbon_saved).toFixed(1)} kg CO₂</span>
                          </div>
                        </div>
                      </div>
                      <RiderDeliveryActions
                        orderId={delivery.order_id}
                        status={orderStatusForDelivery(delivery.status)}
                        onChanged={onChanged}
                        compact
                      />
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