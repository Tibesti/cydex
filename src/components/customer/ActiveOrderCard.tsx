
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { Button } from '@/components/ui/button';
import { Truck, Box, Clock, Leaf, ChevronRight } from 'lucide-react';

interface ActiveOrderProps {
  order: {
    id: string;
    vendor: string;
    status: string;
    eta?: string;
    items: number;
    carbonSaved: number;
    updatedAt: string;
    totalAmount: string;
    paymentStatus: string;
  };
}

const ActiveOrderCard = ({ order }: ActiveOrderProps) => {
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
    <div 
      className="bg-card border-border border rounded-lg p-3 md:p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => navigate(`/customer/orders/${order.id}`)}
    >
      <div className="flex flex-col md:flex-row justify-between">
        <div className="flex items-start space-x-3 md:space-x-4">
          <div className="p-2 bg-primary-light rounded-full">
            {order.status === 'in-transit' ? (
              <Truck className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            ) : (
              <Box className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            )}
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <h3 className="font-medium">{order.vendor}</h3>
              <span className="text-sm text-gray-500">{order.id}</span>
            </div>
            <div className="flex items-center mt-1 flex-wrap gap-2">
              {getStatusBadge(order.status)}
              {getPaymentStatusBadge(order.paymentStatus)}
              {order.eta && (
                <div className="flex items-center text-sm text-gray-600">
                  <Clock className="h-4 w-4 mr-1" />
                  <span>ETA: {order.eta}</span>
                </div>
              )}
            </div>
            <div className="mt-2 text-sm text-gray-600">
              <span>{order.items} items</span>
              <span className="mx-2 text-gray-300">•</span>
              <span>Updated {order.updatedAt}</span>
              <span className="mx-2 text-gray-300">•</span>
              <span>{order.totalAmount}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center mt-4 md:mt-0 justify-between md:justify-end w-full md:w-auto gap-4">
          <div className="flex items-center text-sm bg-green-50 text-green-700 px-2 py-1 rounded">
            <Leaf className="h-4 w-4 mr-1" />
            <span>{order.carbonSaved} kg CO₂ saved</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-1 h-auto"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/customer/orders/${order.id}`);
            }}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ActiveOrderCard;
