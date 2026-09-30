
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from 'sonner';
import { invokeFunction } from '@/lib/edgeFunctions';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CustomerDetails {
  name?: string;
  email: string;
  phone?: string;
  address?: string;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  onSuccess: (reference: string) => void;
  onError: (error: Error) => void;
  orderNumber: string;
  customerEmail: string;
  customerId?: string;
  customerDetails?: Partial<CustomerDetails>;
  metadata?: Record<string, any>;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  amount,
  onSuccess,
  onError,
  orderNumber,
  customerEmail,
  customerId,
  customerDetails = {},
  metadata = {},
}): JSX.Element | null => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const { user } = useAuth();

  // Initialize payment when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // The squad-checkout Edge Function starts the payment server-side, for the
    // total stored on the order (the Squad secret key never reaches the browser)
    const initializeSquadPayment = async () => {
      setIsLoading(true);
      try {
        const { checkout_url } = await invokeFunction<{ checkout_url: string }>('squad-checkout', {
          action: 'initiate', order_number: orderNumber,
        });
        setCheckoutUrl(checkout_url);
      } catch (error) {
        console.error('Error initializing payment:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to initialize payment. Please try again.');
        onError(error instanceof Error ? error : new Error('Payment initialization failed'));
        onClose();
      } finally {
        setIsLoading(false);
      }
    };

    initializeSquadPayment();
  }, [isOpen, orderNumber, onError, onClose]);

  const handlePayment = () => {
    if (!checkoutUrl) {
      toast.error('Payment not ready. Please try again.');
      return;
    }

    // Redirect to Squad checkout page
    // Squad will redirect back to callback_url after payment
    window.location.href = checkoutUrl;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete Your Payment</DialogTitle>
          <DialogDescription>
            You're about to complete your order #{orderNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Customer Information */}
          <div className="space-y-3 p-4 rounded-lg border">
            <h4 className="font-medium text-sm">Customer Information</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium truncate max-w-[60%] text-right">{customerEmail}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span className="font-medium text-right">{customerDetails.phone || 'Not provided'}</span>
              </div>
              {customerDetails.address && (
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Address:</span>
                  <span className="font-medium text-right break-words max-w-[60%]">{customerDetails.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Order Summary */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="font-medium text-sm">Order Summary</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Order Number:</span>
                <span className="font-medium">#{orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Amount:</span>
                <span className="text-lg font-bold">₦{amount.toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          {/* Payment Method Selection */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Choose Payment Method</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-border rounded-lg p-3 text-center bg-muted">
                <div className="text-gray-400 mb-1">💰</div>
                <p className="text-sm font-medium text-gray-500">Wallet</p>
                <p className="text-xs text-gray-400 mt-1">Coming Soon</p>
              </div>
              <div className="border-2 border-primary rounded-lg p-3 text-center bg-primary/5">
                <div className="text-primary mb-1">💳</div>
                <p className="text-sm font-medium text-primary">Squad</p>
                <p className="text-xs text-gray-600 mt-1">Available</p>
              </div>
            </div>
          </div>

          <Button 
            className="w-full bg-primary hover:bg-primary/80 text-black font-semibold py-3"
            onClick={handlePayment}
            disabled={isLoading || !checkoutUrl}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Initializing Payment...
              </>
            ) : (
              `Pay with Squad - ₦${amount.toLocaleString()}`
            )}
          </Button>
          
          <div className="text-center">
            <p className="text-xs text-gray-500">
              Secured by Squad • SSL Encrypted
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
