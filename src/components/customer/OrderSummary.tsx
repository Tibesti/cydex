import React from 'react';
import { Receipt, CreditCard } from 'lucide-react';

interface OrderSummaryProps {
  subtotal: string;
  totalAmount: string;
  serviceCharge: string;
  deliveryFee: string;
  discount: string;
  paymentMethod: string;
}

const OrderSummary = ({ subtotal, totalAmount, serviceCharge, deliveryFee, discount, paymentMethod }: OrderSummaryProps) => {
  return (
    <div>
      <h3 className="font-medium mb-3 flex items-center text-sm sm:text-base">
        <Receipt className="h-4 w-4 sm:h-5 sm:w-5 mr-2 flex-shrink-0" /> 
        Order Summary
      </h3>
      <div className="border rounded-lg p-3 sm:p-4">
        <div className="space-y-2 border-b pb-2">
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-medium">{subtotal}</span>
          </div>
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-gray-600">Service Charge</span>
            <span className="font-medium">{serviceCharge}</span>
          </div>
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-gray-600">Delivery Fee</span>
            <span className="font-medium">{deliveryFee}</span>
          </div>
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-gray-600">Discount</span>
            <span className="text-green-600 font-medium">-{discount}</span>
          </div>
        </div>
        <div className="flex justify-between mt-2 font-bold text-sm sm:text-base">
          <span>Total</span>
          <span>{totalAmount}</span>
        </div>
        <div className="mt-3 flex items-center text-xs sm:text-sm gap-1">
          <CreditCard className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="text-gray-600">Payment:</span>
          <span className="font-medium truncate">{paymentMethod}</span>
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;
