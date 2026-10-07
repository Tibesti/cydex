
import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Clock, Leaf, Phone, Navigation, RefreshCw, AlertCircle } from 'lucide-react';
import { useRiderData } from '@/hooks/useRiderData';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import RiderDeliveryActions from '@/components/rider/RiderDeliveryActions';
import { orderStatusForDelivery } from '@/lib/orderStatus';

const CurrentDeliveriesPage = () => {
  const { user } = useAuth();
  const { 
    loading: riderDataLoading, 
    currentDeliveries, 
    refetch
  } = useRiderData();
  
  const [refreshing, setRefreshing] = useState(false);

  // Auto-refresh every 30 seconds for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentDeliveries.length > 0) {
        refetch.currentDeliveries();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [currentDeliveries.length, refetch.currentDeliveries]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch.currentDeliveries();
      toast.success('Deliveries refreshed');
    } catch (error) {
      toast.error('Failed to refresh deliveries');
    } finally {
      setRefreshing(false);
    }
  };

  const handleContactCustomer = (delivery: any) => {
    // This would integrate with a real communication system
    toast.info('Contact feature would integrate with communication system');
  };

  const handleGetDirections = (delivery: any) => {
    // This would integrate with maps/navigation
    if (delivery.delivery_location?.address) {
      const address = encodeURIComponent(delivery.delivery_location.address);
      window.open(`https://www.google.com/maps/search/?api=1&query=${address}`, '_blank');
    } else {
      toast.error('Delivery address not available');
    }
  };

  if (riderDataLoading) {
    return (
      <DashboardLayout userRole="RIDER">
        <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="RIDER">
      <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-3 sm:space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Current Deliveries</h1>
            <p className="text-sm sm:text-base text-gray-600">
              Manage your active deliveries and track progress
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Badge className="text-xs sm:text-sm bg-blue-500 text-white">
              {currentDeliveries.length} Active
            </Badge>
          </div>
        </div>

        {currentDeliveries.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Deliveries</h3>
              <p className="text-gray-500 mb-4">You don't have any deliveries in progress right now.</p>
              <Button 
                onClick={() => window.location.href = '/rider/available'}
                className="bg-primary hover:bg-primary/90 text-black"
              >
                Browse Available Orders
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {currentDeliveries.map((delivery) => {
              const orderStatus = orderStatusForDelivery(delivery.status);

              return (
                <Card key={delivery.id} className="border-2 border-primary">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base sm:text-lg truncate">
                          {delivery.vendor_name} → {delivery.customer_name}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          Order #{delivery.order?.order_number ?? delivery.order_id?.slice(0, 8)}
                        </CardDescription>
                      </div>
                      <OrderStatusBadge status={orderStatus} />
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="space-y-2">
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">
                            Pickup: {new Date(delivery.estimated_pickup_time).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">
                            Delivery: {new Date(delivery.estimated_delivery_time).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span>Distance: {Number(delivery.actual_distance || 0).toFixed(1)} km</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="font-medium">Items: </span>
                          <span>{delivery.items_count || 0}</span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Your earning: </span>
                          <span>₦{Number(delivery.rider_earning ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center text-sm bg-green-50 text-green-700 px-2 py-1 rounded w-fit">
                          <Leaf className="h-4 w-4 mr-1 flex-shrink-0" />
                          <span>{Number(delivery.carbon_saved || 0).toFixed(1)} kg CO₂ saved</span>
                        </div>
                      </div>
                    </div>

                    {delivery.special_instructions && (
                      <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <h4 className="font-medium text-sm text-blue-900 mb-1">Special Instructions:</h4>
                            <p className="text-sm text-blue-800">{delivery.special_instructions}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mb-4">
                      <RiderDeliveryActions
                        orderId={delivery.order_id}
                        status={orderStatus}
                        onChanged={() => refetch.currentDeliveries()}
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                        onClick={() => handleContactCustomer(delivery)}
                      >
                        <Phone className="h-4 w-4" />
                        Contact
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                        onClick={() => handleGetDirections(delivery)}
                      >
                        <Navigation className="h-4 w-4" />
                        Directions
                      </Button>
                      
                      <Button
                        onClick={() => window.location.href = `/rider/order/${delivery.order_id}`}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        View Details
                      </Button>
                      
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Delivery Tips - Compact version for mobile */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Delivery Tips</CardTitle>
            <CardDescription className="text-sm">Best practices for successful deliveries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3">
            {[
              { num: '1', title: 'Verify pickup details', desc: 'Always confirm order details with the vendor before pickup.' },
              { num: '2', title: 'Handle with care', desc: 'Keep items secure and follow any special handling instructions.' },
              { num: '3', title: 'Communicate proactively', desc: 'Keep customers informed about any delays or issues.' }
            ].map((tip) => (
              <div key={tip.num} className="flex items-start space-x-3">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-blue-600">{tip.num}</span>
                </div>
                <div className="min-w-0">
                  <h4 className="font-medium text-sm">{tip.title}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{tip.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CurrentDeliveriesPage;
