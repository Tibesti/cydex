import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { IN_PROGRESS_STATUSES, type OrderStatus } from '@/lib/orderStatus';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Package, Calendar, MapPin, CreditCard, Truck, Plus } from 'lucide-react';
import { useCustomerOrders } from '@/hooks/useCustomerOrders';
import { useVendorRatings } from '@/hooks/useVendorRatings';
import { VendorRatingModal } from '@/components/customer/VendorRatingModal';
import { formatDistanceToNow } from 'date-fns';

const OrdersPage = () => {
  const navigate = useNavigate();
  const { orders, loading, error } = useCustomerOrders();
  const { getRatingForVendor } = useVendorRatings();
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [selectedOrderForRating, setSelectedOrderForRating] = useState<{
    orderId: string;
    orderNumber: string;
    vendorId: string;
    vendorName: string;
  } | null>(null);

  // Filter orders by status (docs/ORDER_FLOW.md)
  const activeOrders = orders.filter(order =>
    order.status === 'pending' || IN_PROGRESS_STATUSES.includes(order.status as OrderStatus)
  );
  const completedOrders = orders.filter(order => order.status === 'delivered');
  const cancelledOrders = orders.filter(order => order.status === 'cancelled' || order.status === 'rejected');

  const handleRateVendor = (order: any) => {
    setSelectedOrderForRating({
      orderId: order.id,
      orderNumber: order.order_number,
      vendorId: order.vendor_id,
      vendorName: order.vendor?.name || 'Unknown Vendor'
    });
    setIsRatingModalOpen(true);
  };

  const OrderCard = ({ order, showRatingButton = false }: { order: any; showRatingButton?: boolean }) => {
    const vendorRating = getRatingForVendor(order.vendor_id);
    
    return (
      <Card key={order.id} className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm sm:text-lg font-bold truncate">{order.order_number}</CardTitle>
              <CardDescription className="flex items-center gap-1 sm:gap-2 mt-1 text-xs sm:text-sm">
                <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="truncate">{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}</span>
              </CardDescription>
            </div>
            <OrderStatusBadge status={order.status} className="text-xs px-1.5 py-0.5 whitespace-nowrap" />
          </div>
        </CardHeader>
        
        <CardContent className="space-y-2 sm:space-y-4 p-3 sm:p-6 pt-0">
          {/* Vendor and Price Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
              <Package className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500 flex-shrink-0" />
              <span className="text-xs sm:text-sm truncate">{order.vendor?.name || 'Unknown Vendor'}</span>
              {vendorRating.total_ratings > 0 && (
                <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                  <Star className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-yellow-400 fill-yellow-400" />
                  <span className="text-xs text-gray-600 hidden sm:inline">
                    {vendorRating.average_rating.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
            <span className="font-bold text-xs sm:text-sm text-primary whitespace-nowrap">
              ₦{order.total_amount.toLocaleString()}
            </span>
          </div>
          
          {/* Address Row - Hide on very small screens */}
          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-600 hidden xs:flex">
            <MapPin className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="truncate">
              {order.delivery_address?.street}, {order.delivery_address?.city}
            </span>
          </div>
          
          {/* Payment and Delivery Status - Compact on mobile */}
          <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-600">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <CreditCard className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
              <span className="truncate">
                <span className="hidden sm:inline">Payment: </span>
                {order.payment_status}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Truck className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Delivery: </span>
              <span>{order.delivery_type}</span>
            </div>
          </div>
          
          {/* Action Buttons - Responsive */}
          <div className="flex gap-2 pt-1 sm:pt-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate(`/customer/orders/${order.id}`)}
              className="flex-1 h-7 sm:h-8 text-xs sm:text-sm"
            >
              <span className="hidden xs:inline">View Details</span>
              <span className="xs:hidden">Details</span>
            </Button>
            
            {showRatingButton && order.payment_status === 'paid' && (
              <Button 
                variant="default" 
                size="sm"
                onClick={() => handleRateVendor(order)}
                className="flex items-center gap-1 h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3"
              >
                <Star className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                <span className="hidden sm:inline">Rate Vendor</span>
                <span className="sm:hidden">Rate</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="p-2 sm:p-4 md:p-6 max-w-4xl mx-auto">
          <div className="animate-pulse space-y-3 sm:space-y-4">
            <div className="h-6 sm:h-8 bg-muted rounded w-1/4"></div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 sm:h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="p-2 sm:p-4 md:p-6 max-w-4xl mx-auto text-center">
          <h2 className="text-lg sm:text-xl font-bold mb-2">Error Loading Orders</h2>
          <p className="text-gray-600 mb-4 text-sm sm:text-base">{error}</p>
          <Button onClick={() => window.location.reload()} size="sm">
            Try Again
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="CUSTOMER">
      <div className="p-2 sm:p-4 md:p-6 max-w-4xl mx-auto space-y-3 sm:space-y-6">
        {/* Header - Responsive */}
        <div className="flex flex-col xs:flex-row justify-between items-start xs:items-center gap-3 sm:gap-0">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">My Orders</h1>
            <p className="text-gray-600 text-xs sm:text-sm hidden sm:block">Track and manage your orders</p>
          </div>
          <Button 
            onClick={() => navigate('/customer/new-order')}
            className="w-full xs:w-auto h-8 sm:h-9 text-xs sm:text-sm"
          >
            <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">New Order</span>
            <span className="xs:hidden">New</span>
          </Button>
        </div>

        {/* Tabs - Compact */}
        <Tabs defaultValue="active" className="space-y-3 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-8 sm:h-10">
            <TabsTrigger value="active" className="text-xs sm:text-sm px-1 sm:px-3">
              <span className="hidden xs:inline">Active Orders</span>
              <span className="xs:hidden">Active</span>
              <span className="ml-1">({activeOrders.length})</span>
            </TabsTrigger>
            <TabsTrigger value="completed" className="text-xs sm:text-sm px-1 sm:px-3">
              <span className="hidden xs:inline">Completed Orders</span>
              <span className="xs:hidden">Completed</span>
              <span className="ml-1">({completedOrders.length})</span>
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="text-xs sm:text-sm px-1 sm:px-3">
              Cancelled
              <span className="ml-1">({cancelledOrders.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-3 sm:space-y-4">
            {activeOrders.length === 0 ? (
              <Card>
                <CardContent className="text-center py-6 sm:py-8 p-3 sm:p-6">
                  <Package className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
                  <h3 className="text-base sm:text-lg font-medium mb-2">No active orders</h3>
                  <p className="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">
                    You don't have any active orders at the moment.
                  </p>
                  <Button 
                    onClick={() => navigate('/customer/new-order')}
                    size="sm"
                    className="w-full xs:w-auto"
                  >
                    Place Your First Order
                  </Button>
                </CardContent>
              </Card>
            ) : (
              activeOrders.map(order => (
                <OrderCard key={order.id} order={order} />
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-3 sm:space-y-4">
            {completedOrders.length === 0 ? (
              <Card>
                <CardContent className="text-center py-6 sm:py-8 p-3 sm:p-6">
                  <Package className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
                  <h3 className="text-base sm:text-lg font-medium mb-2">No completed orders</h3>
                  <p className="text-gray-600 text-sm sm:text-base">Your completed orders will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              completedOrders.map(order => (
                <OrderCard key={order.id} order={order} showRatingButton={true} />
              ))
            )}
          </TabsContent>

          <TabsContent value="cancelled" className="space-y-3 sm:space-y-4">
            {cancelledOrders.length === 0 ? (
              <Card>
                <CardContent className="text-center py-6 sm:py-8 p-3 sm:p-6">
                  <Package className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
                  <h3 className="text-base sm:text-lg font-medium mb-2">No cancelled orders</h3>
                  <p className="text-muted-foreground text-sm sm:text-base">Cancelled and rejected orders will appear here.</p>
                </CardContent>
              </Card>
            ) : (
              cancelledOrders.map(order => (
                <OrderCard key={order.id} order={order} />
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Vendor Rating Modal */}
        {selectedOrderForRating && (
          <VendorRatingModal 
            isOpen={isRatingModalOpen}
            onClose={() => {
              setIsRatingModalOpen(false);
              setSelectedOrderForRating(null);
            }}
            vendorId={selectedOrderForRating.vendorId}
            vendorName={selectedOrderForRating.vendorName}
            orderId={selectedOrderForRating.orderId}
            orderNumber={selectedOrderForRating.orderNumber}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default OrdersPage;
