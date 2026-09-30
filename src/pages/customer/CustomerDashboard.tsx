
import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Truck, Box, Clock, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCustomerOrders } from '@/hooks/useCustomerOrders';
import { formatDistanceToNow } from 'date-fns';

const CustomerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { orders, loading } = useCustomerOrders();

  // Filter active and past orders
  const activeOrders = orders.filter(order => 
    !['delivered', 'cancelled', 'rejected'].includes(order.status)
  );

  const pastOrders = orders.filter(order =>
    ['delivered', 'cancelled', 'rejected'].includes(order.status)
  );

  const handleOrderClick = (orderId: string) => {
    navigate(`/customer/orders/${orderId}`);
  };

  const getStatusBadge = (status: string) => <OrderStatusBadge status={status} className="text-xs" />;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  };

  // Calculate total carbon savings
  const totalCarbonSaved = orders.reduce(
    (total, order) => total + (order.carbon_credits_earned || 0),
    0
  );

  if (loading) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="p-2 sm:p-4 md:p-6 max-w-full mx-auto space-y-3 sm:space-y-4 md:space-y-6">
            <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
            <div className="h-96 bg-muted rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="CUSTOMER">
      <div className="p-2 sm:p-4 md:p-6 max-w-full mx-auto space-y-3 sm:space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Welcome, {user?.name || user?.email?.split('@')[0] || 'Customer'}</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track your deliveries and eco-impact
            </p>
          </div>
          <Button 
            className="bg-primary hover:bg-primary-hover text-black text-sm sm:text-base w-full sm:w-auto"
            onClick={() => navigate('/customer/new-order')}
          >
            New Order
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
          <Card>
            <CardHeader className="pb-1 sm:pb-2">
              <CardTitle className="text-sm sm:text-base font-medium">Active Orders</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 sm:pt-2">
              <div className="text-2xl sm:text-3xl font-bold">{activeOrders.length}</div>
              <p className="text-xs sm:text-sm text-muted-foreground">Packages on the way</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-1 sm:pb-2">
              <CardTitle className="text-sm sm:text-base font-medium">Carbon Savings</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 sm:pt-2">
              <div className="text-2xl sm:text-3xl font-bold">{totalCarbonSaved.toFixed(1)} kg</div>
              <p className="text-xs sm:text-sm text-muted-foreground">CO₂ reduced this month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 sm:pb-2">
              <CardTitle className="text-sm sm:text-base font-medium">Total Orders</CardTitle>
            </CardHeader>
            <CardContent className="pt-1 sm:pt-2">
              <div className="text-2xl sm:text-3xl font-bold">{orders.length}</div>
              <p className="text-xs sm:text-sm text-muted-foreground">Orders placed</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Orders</CardTitle>
            <CardDescription className="text-sm">Track your current and past deliveries</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs defaultValue="active" className="w-full">
              <TabsList className="mb-3 sm:mb-4 w-full">
                <TabsTrigger value="active" className="text-xs sm:text-sm flex-1">Active Orders</TabsTrigger>
                <TabsTrigger value="past" className="text-xs sm:text-sm flex-1">Order History</TabsTrigger>
              </TabsList>
              
              <TabsContent value="active">
                {activeOrders.length > 0 ? (
                  <div className="space-y-3 sm:space-y-4">
                    {activeOrders.map((order) => (
                      <div 
                        key={order.id} 
                        className="bg-card border-border border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow cursor-pointer" 
                        onClick={() => handleOrderClick(order.id)}
                      >
                        <div className="flex flex-col sm:flex-row justify-between">
                          <div className="flex items-start space-x-3">
                            <div className="p-1.5 sm:p-2 bg-primary-light rounded-full flex-shrink-0">
                              {order.status === 'out_for_delivery' ? (
                                <Truck className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-primary" />
                              ) : (
                                <Box className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-primary" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center flex-wrap gap-1 sm:gap-0">
                                <h3 className="font-medium text-sm sm:text-base truncate">
                                  {order.vendor?.name || 'Unknown Vendor'}
                                </h3>
                                <span className="mx-2 text-muted-foreground/50 hidden sm:inline">•</span>
                                <span className="text-xs sm:text-sm text-muted-foreground">{order.order_number}</span>
                              </div>
                              <div className="flex items-center mt-1 flex-wrap gap-2">
                                {getStatusBadge(order.status)}
                                {order.estimated_delivery_time && (
                                  <div className="flex items-center text-xs sm:text-sm text-muted-foreground">
                                    <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                    <span>ETA: {new Date(order.estimated_delivery_time).toLocaleTimeString()}</span>
                                  </div>
                                )}
                              </div>
                              <div className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground">
                                <span>{order.order_items?.length || 0} items</span>
                                <span className="mx-2 text-muted-foreground/50">•</span>
                                <span>Updated {formatDistanceToNow(new Date(order.updated_at))} ago</span>
                              </div>
                              {/* Order Items Preview */}
                              {order.order_items && order.order_items.length > 0 && (
                                <div className="mt-2 flex -space-x-1 overflow-hidden">
                                  {order.order_items.slice(0, 3).map((item, index) => (
                                    <div key={index} className="h-6 w-6 sm:h-8 sm:w-8 bg-muted border border-background rounded flex items-center justify-center flex-shrink-0" title={item.product_name || 'Product'}>
                                      <Box className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                                    </div>
                                  ))}
                                  {order.order_items.length > 3 && (
                                    <div className="h-6 w-6 sm:h-8 sm:w-8 bg-muted border border-background rounded flex items-center justify-center text-xs text-muted-foreground font-medium">
                                      +{order.order_items.length - 3}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-end mt-3 sm:mt-0 sm:ml-4">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="p-1 h-auto"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOrderClick(order.id);
                              }}
                            >
                              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 sm:py-10">
                    <p className="text-muted-foreground text-sm sm:text-base">No active orders</p>
                    <Button 
                      className="mt-3 sm:mt-4 bg-primary hover:bg-primary-hover text-black text-sm sm:text-base"
                      onClick={() => navigate('/customer/new-order')}
                    >
                      Place an Order
                    </Button>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="past">
                <div className="space-y-3 sm:space-y-4">
                  {pastOrders.map((order) => (
                    <div 
                      key={order.id} 
                      className="bg-card border-border border rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => handleOrderClick(order.id)}
                    >
                      <div className="flex flex-col sm:flex-row justify-between">
                        <div className="flex items-start space-x-3">
                          <div className="p-1.5 sm:p-2 bg-muted rounded-full flex-shrink-0">
                            <Box className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center flex-wrap gap-1 sm:gap-0">
                              <h3 className="font-medium text-sm sm:text-base truncate">
                                {order.vendor?.name || 'Unknown Vendor'}
                              </h3>
                              <span className="mx-2 text-muted-foreground/50 hidden sm:inline">•</span>
                              <span className="text-xs sm:text-sm text-muted-foreground">{order.order_number}</span>
                            </div>
                            <div className="flex items-center mt-1 flex-wrap gap-2">
                              {getStatusBadge(order.status)}
                              <div className="text-xs sm:text-sm text-muted-foreground">
                                {new Date(order.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground">
                              <span>{order.order_items?.length || 0} items</span>
                              <span className="mx-2 text-muted-foreground/50">•</span>
                              <span>{formatCurrency(order.total_amount)}</span>
                            </div>
                            {/* Order Items Preview */}
                            {order.order_items && order.order_items.length > 0 && (
                              <div className="mt-2 flex -space-x-1 overflow-hidden">
                                {order.order_items.slice(0, 3).map((item, index) => (
                                  <div key={index} className="h-6 w-6 sm:h-8 sm:w-8 bg-muted border border-background rounded flex items-center justify-center flex-shrink-0" title={item.product_name || 'Product'}>
                                    <Box className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                                    </div>
                                  ))}
                                  {order.order_items.length > 3 && (
                                    <div className="h-6 w-6 sm:h-8 sm:w-8 bg-muted border border-background rounded flex items-center justify-center text-xs text-muted-foreground font-medium">
                                    +{order.order_items.length - 3}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-end mt-3 sm:mt-0 sm:ml-4">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="p-1 h-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOrderClick(order.id);
                            }}
                          >
                            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CustomerDashboard;
