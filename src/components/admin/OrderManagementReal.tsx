import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Package, Eye, MoreHorizontal } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getAllOrders, getOrdersByStatus } from '@/utils/adminUtils';
import { toast } from 'sonner';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import AdminRiderActionDialog, { type RiderAction } from './AdminRiderActionDialog';
import { ORDER_STATUSES, orderStatusLabel } from '@/lib/orderStatus';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// Define the order type to match what we actually get from Supabase
interface OrderFromSupabase {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method?: string;
  delivery_type: string;
  total_amount: number;
  delivery_fee?: number;
  created_at: string;
  delivered_at?: string;
  customer?: any; // Using any to handle Supabase's flexible response
  rider?: any;
  vendor?: any;
  order_items?: any[];
}

export function OrderManagementReal() {
  const [orders, setOrders] = useState<OrderFromSupabase[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderFromSupabase[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderFromSupabase | null>(null);
  const [riderAction, setRiderAction] = useState<{ action: RiderAction; order: OrderFromSupabase } | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    filterOrders();
  }, [orders, statusFilter, searchQuery]);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const ordersList = await getAllOrders();
      console.log('Loaded orders:', ordersList);
      setOrders(ordersList);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const filterOrders = () => {
    let filtered = orders;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order => 
        order.order_number?.toLowerCase().includes(query) ||
        getCustomerName(order.customer)?.toLowerCase().includes(query) ||
        getCustomerEmail(order.customer)?.toLowerCase().includes(query)
      );
    }

    setFilteredOrders(filtered);
  };

  // Helper function to safely get customer name
  const getCustomerName = (customer: any): string => {
    if (!customer || typeof customer === 'string' || customer.error) {
      return 'Unknown';
    }
    return customer.name || 'Unknown';
  };

  // Helper function to safely get customer email
  const getCustomerEmail = (customer: any): string => {
    if (!customer || typeof customer === 'string' || customer.error) {
      return 'No email';
    }
    return customer.email || 'No email';
  };

  // Helper function to safely get order items count
  const getOrderItemsCount = (orderItems: any): number => {
    if (!orderItems || typeof orderItems === 'string' || orderItems.error) {
      return 0;
    }
    return Array.isArray(orderItems) ? orderItems.length : 0;
  };

  const handleViewDetails = (order: OrderFromSupabase) => {
    setSelectedOrder(order);
    setIsDetailDialogOpen(true);
  };


  const getStatusBadgeColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'confirmed': return 'bg-indigo-100 text-indigo-800';
      case 'preparing': return 'bg-purple-100 text-purple-800';
      case 'ready': return 'bg-cyan-100 text-cyan-800';
      case 'out_for_delivery': return 'bg-orange-100 text-orange-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'refunded': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'refunded': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Order Management</CardTitle>
          <CardDescription>
            Monitor and manage all platform orders ({filteredOrders.length} of {orders.length} orders shown).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by order number or customer..."
                className="pl-8 w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {ORDER_STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>{orderStatusLabel(st)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" className="gap-1.5" onClick={loadOrders}>
                <Filter className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading orders...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pb-2 font-medium">Order</th>
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Payment</th>
                    <th className="pb-2 font-medium">Total</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(order => (
                    <tr key={order.id} className="border-b">
                      <td className="py-4">
                        <div>
                          <div className="font-medium">{order.order_number}</div>
                          <div className="text-sm text-gray-600">
                            {getOrderItemsCount(order.order_items)} items
                          </div>
                          <div className="text-xs text-gray-500">
                            {order.delivery_type}
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <div>
                          <div className="font-medium">{getCustomerName(order.customer)}</div>
                          <div className="text-sm text-gray-600">{getCustomerEmail(order.customer)}</div>
                        </div>
                      </td>
                      <td className="py-4">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="py-4">
                        <Badge className={getPaymentStatusColor(order.payment_status)}>
                          {formatStatus(order.payment_status)}
                        </Badge>
                        {order.payment_method && (
                          <div className="text-xs text-gray-500 mt-1">
                            {order.payment_method}
                          </div>
                        )}
                      </td>
                      <td className="py-4">
                        <div className="font-medium">{formatCurrency(order.total_amount)}</div>
                        {order.delivery_fee && order.delivery_fee > 0 && (
                          <div className="text-xs text-gray-500">
                            +{formatCurrency(order.delivery_fee)} delivery
                          </div>
                        )}
                      </td>
                      <td className="py-4 text-sm">
                        <div>{new Date(order.created_at).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(order.created_at).toLocaleTimeString()}
                        </div>
                        {order.delivered_at && (
                          <div className="text-xs text-green-600">
                            Delivered {new Date(order.delivered_at).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewDetails(order)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {['rider_assigned', 'picking_up'].includes(order.status) && (
                              <DropdownMenuItem onClick={() => setRiderAction({ action: 'relieve', order })}>
                                Relieve rider
                              </DropdownMenuItem>
                            )}
                            {['ready_for_pickup', 'rider_assigned', 'picking_up'].includes(order.status) && (
                              <DropdownMenuItem onClick={() => setRiderAction({ action: 'reassign', order })}>
                                {order.rider ? 'Reassign rider' : 'Assign a rider'}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredOrders.length === 0 && !isLoading && (
                <div className="text-center py-8 text-gray-500">
                  No orders found matching your criteria.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Order Details Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Complete information for order {selectedOrder?.order_number}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold mb-2">Order Information</h3>
                  <div className="space-y-2 text-sm">
                    <div><span className="font-medium">Order Number:</span> {selectedOrder.order_number}</div>
                    <div><span className="font-medium">Status:</span> <OrderStatusBadge status={selectedOrder.status} /></div>
                    <div><span className="font-medium">Created:</span> {new Date(selectedOrder.created_at).toLocaleString()}</div>
                    {selectedOrder.delivered_at && (
                      <div><span className="font-medium">Delivered:</span> {new Date(selectedOrder.delivered_at).toLocaleString()}</div>
                    )}
                    <div><span className="font-medium">Delivery Type:</span> {selectedOrder.delivery_type}</div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Customer Information</h3>
                  <div className="space-y-2 text-sm">
                    <div><span className="font-medium">Name:</span> {getCustomerName(selectedOrder.customer)}</div>
                    <div><span className="font-medium">Email:</span> {getCustomerEmail(selectedOrder.customer)}</div>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Payment Information</h3>
                <div className="space-y-2 text-sm">
                  <div><span className="font-medium">Status:</span> <Badge className={getPaymentStatusColor(selectedOrder.payment_status)}>{formatStatus(selectedOrder.payment_status)}</Badge></div>
                  {selectedOrder.payment_method && (
                    <div><span className="font-medium">Method:</span> {selectedOrder.payment_method}</div>
                  )}
                  <div><span className="font-medium">Total Amount:</span> {formatCurrency(selectedOrder.total_amount)}</div>
                  {selectedOrder.delivery_fee && selectedOrder.delivery_fee > 0 && (
                    <div><span className="font-medium">Delivery Fee:</span> {formatCurrency(selectedOrder.delivery_fee)}</div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Order Items ({getOrderItemsCount(selectedOrder.order_items)})</h3>
                <div className="border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-3">Item</th>
                        <th className="text-right p-3">Quantity</th>
                        <th className="text-right p-3">Price</th>
                        <th className="text-right p-3">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(selectedOrder.order_items) && selectedOrder.order_items.map((item: any, index: number) => (
                        <tr key={index} className="border-t">
                          <td className="p-3">{item.product_name || `Item ${index + 1}`}</td>
                          <td className="text-right p-3">{item.quantity || 1}</td>
                          <td className="text-right p-3">{formatCurrency(item.unit_price || 0)}</td>
                          <td className="text-right p-3">{formatCurrency(item.total_price || item.unit_price * item.quantity || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              Close
            </Button>
            {selectedOrder && ['ready_for_pickup', 'rider_assigned', 'picking_up'].includes(selectedOrder.status) && (
              <div className="flex gap-2">
                {['rider_assigned', 'picking_up'].includes(selectedOrder.status) && (
                  <Button variant="outline" onClick={() => setRiderAction({ action: 'relieve', order: selectedOrder })}>
                    Relieve rider
                  </Button>
                )}
                <Button onClick={() => setRiderAction({ action: 'reassign', order: selectedOrder })}>
                  {selectedOrder.rider ? 'Reassign rider' : 'Assign a rider'}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminRiderActionDialog
        action={riderAction?.action ?? null}
        order={riderAction?.order ?? null}
        onClose={() => setRiderAction(null)}
        onDone={() => {
          setRiderAction(null);
          setIsDetailDialogOpen(false);
          loadOrders();
        }}
      />
    </div>
  );
}
