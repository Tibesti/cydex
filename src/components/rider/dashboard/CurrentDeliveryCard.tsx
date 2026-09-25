import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, MapPin, Clock, User, Navigation, Leaf } from 'lucide-react';
import { DeliveryData } from '@/hooks/useRiderData';
import { VerificationInput } from '../VerificationInput';

interface CurrentDeliveryCardProps {
  currentDeliveries: DeliveryData[];
  onUpdateStatus: (deliveryId: string, status: DeliveryData['status']) => void;
}

export const CurrentDeliveryCard: React.FC<CurrentDeliveryCardProps> = ({
  currentDeliveries,
  onUpdateStatus
}) => {
  const [showVerification, setShowVerification] = useState<string | null>(null);

  const handleStatusUpdate = (deliveryId: string, status: DeliveryData['status']) => {
    if (status === 'delivered') {
      setShowVerification(deliveryId);
    } else {
      onUpdateStatus(deliveryId, status);
    }
  };

  const handleVerificationSuccess = (deliveryId: string) => {
    onUpdateStatus(deliveryId, 'delivered');
    setShowVerification(null);
  };

  const handleVerificationFailure = () => {
    setShowVerification(null);
  };

  const getStatusButton = (delivery: DeliveryData) => {
    switch (delivery.status) {
      case 'accepted':
        return (
          <Button
            onClick={() => handleStatusUpdate(delivery.id, 'picking_up')}
            className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm h-7 sm:h-8"
          >
            Start Pickup
          </Button>
        );
      case 'picking_up':
        return (
          <Button
            onClick={() => handleStatusUpdate(delivery.id, 'picked_up')}
            className="bg-orange-600 hover:bg-orange-700 text-xs sm:text-sm h-7 sm:h-8"
          >
            Mark Picked Up
          </Button>
        );
      case 'picked_up':
        return (
          <Button
            onClick={() => handleStatusUpdate(delivery.id, 'delivering')}
            className="bg-purple-600 hover:bg-purple-700 text-xs sm:text-sm h-7 sm:h-8"
          >
            Start Delivery
          </Button>
        );
      case 'delivering':
        return (
          <Button
            onClick={() => handleStatusUpdate(delivery.id, 'delivered')}
            className="bg-green-600 hover:bg-green-700 text-xs sm:text-sm h-7 sm:h-8"
          >
            Complete Delivery
          </Button>
        );
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      accepted: { color: 'bg-blue-100 text-blue-800', label: 'Accepted' },
      picking_up: { color: 'bg-orange-100 text-orange-800', label: 'Picking Up' },
      picked_up: { color: 'bg-purple-100 text-purple-800', label: 'Picked Up' },
      delivering: { color: 'bg-green-100 text-green-800', label: 'Delivering' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.accepted;
    return <Badge className={`${config.color} text-xs`}>{config.label}</Badge>;
  };

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
                {showVerification === delivery.id ? (
                  <VerificationInput
                    orderNumber={delivery.order_id}
                    customerName={delivery.customer_name || 'Unknown Customer'}
                    expectedCode="1234" // This should come from the order data
                    onVerificationSuccess={() => handleVerificationSuccess(delivery.id)}
                    onVerificationFailure={handleVerificationFailure}
                  />
                ) : (
                  <div className="bg-card border-border border rounded-lg p-3 sm:p-4">
                    <div className="flex flex-col space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="h-5 w-5 text-blue-600" />
                          <span className="font-medium text-sm sm:text-base">
                            Order {delivery.order_id}
                          </span>
                        </div>
                        {getStatusBadge(delivery.status)}
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
                        {getStatusButton(delivery)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};