import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { CardTitle, CardDescription } from '@/components/ui/card';
import { getPaymentStatusBadge } from '@/utils/StatusUtils';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { useNavigate } from 'react-router-dom';

interface OrderDetailHeaderProps {
  id: string;
  vendor: string;
  status: string;
  paymentStatus: string;
}

const OrderDetailHeader = ({ id, vendor, status, paymentStatus }: OrderDetailHeaderProps) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          onClick={() => navigate(-1)} 
          size="sm"
          className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm"
        >
          <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
          <span className="hidden xs:inline">Back</span>
        </Button>
        <h1 className="text-base sm:text-xl md:text-2xl font-bold">Order Details</h1>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-sm sm:text-lg md:text-xl truncate">{vendor}</CardTitle>
          <CardDescription className="text-gray-500 text-xs sm:text-sm">
            Order #{id}
          </CardDescription>
        </div>
        
        <div className="flex flex-wrap gap-1 sm:gap-2 w-full sm:w-auto">
            <OrderStatusBadge status={status} className="text-xs sm:text-sm px-2 py-1" />
            {getPaymentStatusBadge(paymentStatus)}
        </div>
      </div>
    </div>
  );
};

export default OrderDetailHeader;
