import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Package, 
  TrendingUp, 
  DollarSign, 
  Leaf, 
  Star,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus
} from 'lucide-react';
import { useVendorStats } from '@/hooks/useVendorStats';
import { useVendorOrders } from '@/hooks/useVendorOrders';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { useNavigate } from 'react-router-dom';
import TopSellingProducts from './TopSellingProducts';

const VendorDashboardReal = () => {
  const { stats, loading: statsLoading } = useVendorStats();
  const { orders, loading: ordersLoading } = useVendorOrders();
  const navigate = useNavigate();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });
  };

  // Calculate recent orders metrics
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const todayOrders = orders.filter(order => 
    new Date(order.created_at) >= todayStart
  );
  
  const pendingOrders = orders.filter(order => 
    order.status === 'pending'
  );

  const recentOrders = orders.slice(0, 5);

  const getStatusBadge = (status: string) => <OrderStatusBadge status={status} className="text-xs" />;

  if (statsLoading || ordersLoading) {
    return (
      <div className="p-3">
        <div className="animate-pulse space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-muted rounded-lg"></div>
            ))}
          </div>
          <div className="h-96 bg-muted rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <h1 className="text-lg sm:text-xl font-bold">Vendor Dashboard</h1>
        <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2">
          <Button 
            onClick={() => navigate('/vendor/add-product')} 
            variant="outline"
            size="sm"
            className="w-full sm:w-auto justify-center text-xs sm:text-sm"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Product
          </Button>
          <Button 
            onClick={() => navigate('/vendor/orders')}
            size="sm"
            className="w-full sm:w-auto justify-center text-xs sm:text-sm"
          >
            View Orders
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2 px-3">
            <CardTitle className="text-xs sm:text-sm font-medium">Orders</CardTitle>
            <Package className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-2 px-3">
            <div className="text-base sm:text-lg font-bold">{stats?.total_orders || 0}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {todayOrders.length} today
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2 px-3">
            <CardTitle className="text-xs sm:text-sm font-medium">Revenue</CardTitle>
            <DollarSign className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-2 px-3">
            <div className="text-base sm:text-lg font-bold truncate">
              {formatCurrency(stats?.total_revenue || 0)}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Earned, all time
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2 px-3">
            <CardTitle className="text-xs sm:text-sm font-medium">Carbon</CardTitle>
            <Leaf className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-2 px-3">
            <div className="text-base sm:text-lg font-bold">
              {(stats?.total_carbon_saved || 0).toFixed(1)}kg
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Saved
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer overflow-hidden transition-colors hover:bg-muted/60"
          onClick={() => navigate('/vendor/settings?tab=ratings')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2 px-3">
            <CardTitle className="text-xs sm:text-sm font-medium">Rating</CardTitle>
            <Star className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="py-2 px-3">
            <div className="text-base sm:text-lg font-bold">
              {(stats?.rating || 0).toFixed(1)}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {stats?.rating_count ? `${stats.rating_count} ${stats.rating_count === 1 ? 'rating' : 'ratings'}` : 'No ratings yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card className="overflow-hidden">
        <CardHeader className="py-3 px-3">
          <CardTitle className="flex items-center justify-between">
            <span className="text-sm sm:text-base">Recent Orders</span>
            <Badge variant="outline" className="ml-2 text-xs">
              {pendingOrders.length} pending
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentOrders.length === 0 ? (
            <div className="text-center py-6 px-3 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm font-medium mb-1">No orders yet</p>
              <p className="text-xs">Orders will appear here once customers place them.</p>
            </div>
          ) : (
            <div className="divide-y">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 hover:bg-muted/60 transition-colors cursor-pointer"
                  onClick={() => navigate(`/vendor/orders/${order.id}`)}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs font-medium">#{order.order_number}</span>
                      {getStatusBadge(order.status)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {order.customer?.name || 'Unknown'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatDate(order.created_at)}
                    </div>
                  </div>
                  <div className="text-right mt-2 sm:mt-0">
                    <div className="text-xs font-semibold">
                      {formatCurrency(order.subtotal)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {order.order_items?.length || 0} items
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Best sellers (full product management is on the Products page) */}
      <TopSellingProducts />
    </div>
  );
};

export default VendorDashboardReal;
