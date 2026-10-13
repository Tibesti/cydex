import React from 'react';
import { Receipt, CreditCard } from 'lucide-react';

interface OrderSummaryProps {
  /** Items total; null for deliveries with no items (Cydex Express) */
  subtotal: string | null;
  totalAmount: string;
  serviceCharge: string;
  deliveryFee: string;
  /** Promotion or coupon taken off, if any */
  discount?: string | null;
  /** What came from their wallet, if anything */
  walletPaid?: string | null;
  paymentMethod: string;
}

const OrderSummary = ({ subtotal, totalAmount, serviceCharge, deliveryFee, discount, walletPaid, paymentMethod }: OrderSummaryProps) => {
  return (
    <div>
      <h3 className="font-medium mb-3 flex items-center text-sm sm:text-base">
        <Receipt className="h-4 w-4 sm:h-5 sm:w-5 mr-2 flex-shrink-0" /> 
        {subtotal === null ? 'Payment Summary' : 'Order Summary'}
      </h3>
      <div className="border rounded-lg p-3 sm:p-4">
        <div className="space-y-2 border-b pb-2">
          {subtotal !== null && (
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{subtotal}</span>
            </div>
          )}
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">Delivery Fee</span>
            <span className="font-medium">{deliveryFee}</span>
          </div>
          <div className="flex justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">Service Charge</span>
            <span className="font-medium">{serviceCharge}</span>
          </div>
          {discount && (
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span className="text-green-600 font-medium">-{discount}</span>
            </div>
          )}
        </div>
        <div className="flex justify-between mt-2 font-bold text-sm sm:text-base">
          <span>Total</span>
          <span>{totalAmount}</span>
        </div>
        {walletPaid && (
          <div className="mt-1 flex justify-between text-xs text-muted-foreground sm:text-sm">
            <span>From your wallet</span>
            <span>{walletPaid}</span>
          </div>
        )}
        <div className="mt-3 flex items-center text-xs sm:text-sm gap-1">
          <CreditCard className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
          <span className="text-muted-foreground">Payment:</span>
          <span className="font-medium truncate">{paymentMethod}</span>
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;
