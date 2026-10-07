
import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import RiderPhoneNotice from '@/components/rider/RiderPhoneNotice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Navigation, Phone, RefreshCw, AlertCircle } from 'lucide-react';
import { useRiderData } from '@/hooks/useRiderData';
import { useRiderDeliveries } from '@/hooks/rider/useRiderDeliveries';
import { OrderFilters } from '@/components/rider/orders/OrderFilters';
import { OrderCard } from '@/components/rider/orders/OrderCard';
import { OrdersTable } from '@/components/rider/orders/OrdersTable';
import { useRiderLocation } from '@/hooks/useRiderLocation';
import { pickupDistanceKm } from '@/lib/riderLocation';

const AvailableOrdersPage = () => {
  const { 
    availableDeliveries: riderDataDeliveries, 
    loading: riderDataLoading,
    refetch: riderDataRefetch 
  } = useRiderData();
  
  const {
    availableDeliveries,
    loading: deliveriesLoading,
    error: deliveriesError,
    acceptDelivery,
    fetchAvailableDeliveries
  } = useRiderDeliveries();
  
  const [searchQuery, setSearchQuery] = useState('');
  const { position } = useRiderLocation();
  const [sortBy, setSortBy] = useState('distance');
  const [filteredOrders, setFilteredOrders] = useState(availableDeliveries);
  const [acceptingOrder, setAcceptingOrder] = useState<string | null>(null);

  // Use deliveries from the specific hook, fallback to rider data
  const ordersToUse = availableDeliveries.length > 0 ? availableDeliveries : riderDataDeliveries;
  const loading = deliveriesLoading || riderDataLoading;
  const error = deliveriesError;

  // Real-time updates setup
  useEffect(() => {
    console.log('[AvailableOrders] Setting up auto-refresh');
    const interval = setInterval(() => {
      if (!loading) {
        fetchAvailableDeliveries();
        riderDataRefetch.availableDeliveries();
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [loading, fetchAvailableDeliveries, riderDataRefetch.availableDeliveries]);

  // Filter and sort logic
  useEffect(() => {
    let filtered = [...ordersToUse];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.vendor_name?.toLowerCase().includes(query) ||
          order.customer_name?.toLowerCase().includes(query) ||
          order.order_id?.toLowerCase().includes(query)
      );
    }

    // Sort logic
    switch (sortBy) {
      case 'distance':
        // Nearest pickup first; unknown distances last
        filtered.sort((a, b) => {
          const da = pickupDistanceKm(a.pickup_location, position) ?? Infinity;
          const db = pickupDistanceKm(b.pickup_location, position) ?? Infinity;
          return da === db ? 0 : da - db;
        });
        break;
      case 'fee':
        filtered.sort((a, b) => Number(b.rider_earning ?? 0) - Number(a.rider_earning ?? 0));
        break;
      case 'time':
        filtered.sort((a, b) => 
          new Date(a.estimated_pickup_time).getTime() - new Date(b.estimated_pickup_time).getTime()
        );
        break;
      default:
        break;
    }
    // Orders an admin put back in the pool (rider relieved) always come first
    filtered.sort((a, b) => (b.order?.dispatch_priority ?? 0) - (a.order?.dispatch_priority ?? 0));

    setFilteredOrders(filtered);
  }, [ordersToUse, searchQuery, sortBy, position]);

  const handleAcceptOrder = async (orderId: string) => {
    if (acceptingOrder) return; // Prevent multiple simultaneous accepts
    
    setAcceptingOrder(orderId);
    try {
      console.log('[AvailableOrders] Accepting order:', orderId);
      const result = await acceptDelivery(orderId);
      
      if (result.success && result.orderId) {
        // Redirect to the order detail page
        window.location.href = `/rider/order/${result.orderId}`;
      }
    } catch (error) {
      console.error('[AvailableOrders] Error accepting order:', error);
    } finally {
      setAcceptingOrder(null);
    }
  };

  const handleRefresh = () => {
    console.log('[AvailableOrders] Manual refresh triggered');
    fetchAvailableDeliveries();
    riderDataRefetch.availableDeliveries();
  };

  return (
    <DashboardLayout userRole="RIDER">
      <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-3 sm:space-y-4 md:space-y-6">
        <RiderPhoneNotice />
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Available Orders</h1>
            <p className="text-sm sm:text-base text-gray-600">
              Deliveries with pickups within 5 km of you
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Badge className="text-xs sm:text-sm bg-green-500">
              <TrendingUp className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />
              {ordersToUse.length} Available
            </Badge>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <div>
                  <h3 className="font-medium text-red-900">Error Loading Orders</h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  className="ml-auto"
                >
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <OrderFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        {/* Orders Display */}
        {!error && (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {loading && filteredOrders.length === 0 ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-32 bg-gray-200 rounded-lg"></div>
                    </div>
                  ))}
                </div>
              ) : filteredOrders.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <p className="text-gray-500">No available orders found matching your filters.</p>
                  </CardContent>
                </Card>
              ) : (
                filteredOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onAcceptOrder={handleAcceptOrder}
                    loading={acceptingOrder === order.id}
                  />
                ))
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block">
              <OrdersTable
                orders={filteredOrders}
                onAcceptOrder={handleAcceptOrder}
                loading={loading && filteredOrders.length === 0}
                error={error}
              />
            </div>
          </>
        )}

        {/* Tips Card */}
        <Card>
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Delivery Excellence Tips</CardTitle>
            <CardDescription className="text-sm">
              Maximize your earnings and sustainability impact
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 p-2 bg-blue-50 rounded-full">
                  <Navigation className="h-4 w-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Optimize Your Route</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Plan efficient routes to save time, fuel, and reduce emissions while maximizing deliveries.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 p-2 bg-green-50 rounded-full">
                  <Phone className="h-4 w-4 text-green-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Proactive Communication</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Keep customers informed about delivery status and any potential delays.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 p-2 bg-amber-50 rounded-full">
                  <TrendingUp className="h-4 w-4 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Longer Trips Pay More</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    The delivery fee rises with distance above the ₦600 minimum. Sort by highest pay to compare.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AvailableOrdersPage;
