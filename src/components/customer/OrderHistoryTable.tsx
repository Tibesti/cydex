
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Table, TableBody, TableCaption, TableCell, 
  TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { Button } from '@/components/ui/button';
import { Leaf } from 'lucide-react';

interface PastOrder {
  id: string;
  vendor: string;
  status: string;
  date: string;
  items: number;
  carbonSaved: number;
  totalAmount: string;
  paymentStatus: string;
}

interface OrderHistoryTableProps {
  orders: PastOrder[];
}

const OrderHistoryTable = ({ orders }: OrderHistoryTableProps) => {
  const navigate = useNavigate();

  const getStatusBadge = (status: string) => <OrderStatusBadge status={status} />;

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500">Paid</Badge>;
      case 'pending':
        return <Badge className="bg-amber-500">Pending</Badge>;
      case 'refunded':
        return <Badge className="bg-blue-500">Refunded</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableCaption>A list of your past orders</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Order ID</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>CO₂ Saved</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/customer/orders/${order.id}`)}>
              <TableCell className="font-medium">{order.id}</TableCell>
              <TableCell>{order.vendor}</TableCell>
              <TableCell>{order.date}</TableCell>
              <TableCell>{getStatusBadge(order.status)}</TableCell>
              <TableCell>{getPaymentStatusBadge(order.paymentStatus)}</TableCell>
              <TableCell>{order.totalAmount}</TableCell>
              <TableCell>
                <div className="flex items-center text-sm text-green-700">
                  <Leaf className="h-4 w-4 mr-1" />
                  <span>{order.carbonSaved} kg</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/customer/orders/${order.id}`);
                  }}
                >
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default OrderHistoryTable;
