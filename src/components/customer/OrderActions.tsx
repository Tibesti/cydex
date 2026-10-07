
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { customerCanCancel } from '@/lib/orderStatus';

interface OrderActionsProps {
  status: string;
  onCancelOrder?: () => void;
  onDownloadReceipt?: () => void;
  onReorder?: () => void;
}

const OrderActions = ({ status, onCancelOrder, onDownloadReceipt, onReorder }: OrderActionsProps) => {
  const [confirmCancel, setConfirmCancel] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
      {/* Customers can cancel until the vendor accepts */}
      {customerCanCancel(status) && onCancelOrder && (
        <Button 
          variant="outline" 
          size="sm"
          className="border-red-500 text-red-500 hover:bg-red-50 h-8 sm:h-9 text-xs sm:text-sm flex-1 sm:flex-none"
          onClick={() => setConfirmCancel(true)}
        >
          Cancel Order
        </Button>
      )}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
            <AlertDialogDescription>
              If you've already paid, the full amount goes back to your Cydex wallet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onCancelOrder?.()}
            >
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button 
        variant="outline" 
        size="sm"
        className="h-8 sm:h-9 text-xs sm:text-sm flex-1 sm:flex-none"
        onClick={() => {
          // Generate receipt PDF
          const receiptContent = `
            Order Receipt
            Order Number: ${status}
            Date: ${new Date().toLocaleDateString()}
            
            Thank you for your order!
            
            This is your official receipt.
          `;
          
          const blob = new Blob([receiptContent], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `receipt-${Date.now()}.txt`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          if (onDownloadReceipt) onDownloadReceipt();
        }}
      >
        <span className="hidden xs:inline">Download </span>Receipt
      </Button>
      <Button 
        size="sm"
        className="bg-primary hover:bg-primary-hover text-black h-8 sm:h-9 text-xs sm:text-sm flex-1 sm:flex-none" 
        onClick={onReorder}
      >
        Reorder
      </Button>
    </div>
  );
};

export default OrderActions;
