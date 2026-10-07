import { CheckCircle, Loader2 } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { invokeFunction } from '@/lib/edgeFunctions';

interface LocationState {
  orderNumber?: string;
  amount?: number;
}

const OrderConfirmation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'success' | 'failed' | 'pending'>('pending');
  
  // Get order number from state or URL params
  const orderNumberFromState = (location.state as LocationState)?.orderNumber;
  const orderNumberFromUrl = searchParams.get('order');
  const transactionRef = searchParams.get('transaction_ref'); // Squad redirects with this
  const orderNumber = orderNumberFromState || orderNumberFromUrl;
  const { amount } = (location.state || {}) as LocationState;

  // Verify payment when component mounts if transaction_ref is present
  useEffect(() => {
    const verifyPayment = async () => {
      if (!transactionRef || !orderNumber) return;

      setIsVerifying(true);
      try {
        // Squad is asked server-side (squad-checkout Edge Function), which marks
        // the order paid. The squad-webhook function does the same if this page
        // never loads, so a repeat is harmless.
        const data = await invokeFunction<{ status: string }>('squad-checkout', {
          action: 'verify', transaction_ref: transactionRef,
        });

        if (data?.status === 'paid' || data?.status === 'already_paid') {
          setVerificationStatus('success');
          toast.success('Payment confirmed!');
        } else if (data?.status === 'refunded') {
          setVerificationStatus('success');
          toast.info('This order was cancelled, so your payment was refunded to your wallet.');
        } else if (data?.status === 'amount_mismatch') {
          setVerificationStatus('failed');
          toast.error('The amount paid doesn\'t match the order. Please contact support.');
        } else {
          setVerificationStatus('failed');
          toast.error('We couldn\'t confirm this payment yet.');
        }
      } catch (error) {
        console.error('Payment verification error:', error);
        setVerificationStatus('failed');
        toast.error('Failed to verify payment. Please contact support.');
      } finally {
        setIsVerifying(false);
      }
    };

    verifyPayment();
  }, [transactionRef, orderNumber]);

  if (!orderNumber) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Order information not found.</h2>
          <Button onClick={() => navigate('/customer/orders')}>Go to Orders</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        {isVerifying ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
              <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">Verifying Payment...</h1>
            <p className="mt-2 text-gray-600">
              Please wait while we verify your payment.
            </p>
          </>
        ) : verificationStatus === 'failed' ? (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold">Payment Verification Failed</h1>
            <p className="mt-2 text-gray-600">
              We couldn't verify your payment. Please contact support if you've been charged.
            </p>
            <div className="mt-6 space-y-3">
              <Button className="w-full" onClick={() => navigate('/customer/orders')}>
                View Orders
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/customer/new-order')}>
                Try Again
              </Button>
            </div>
          </>
        ) : (
          <>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-10 w-10 text-green-600" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">Order Confirmed!</h1>
        <p className="mt-2 text-gray-600">
          Your order <span className="font-medium">#{orderNumber}</span> has been placed successfully.
        </p>
            {amount && (
              <p className="mt-2 text-lg font-medium">Amount: ₦{amount.toLocaleString()}</p>
            )}
            {transactionRef && (
              <p className="mt-1 text-xs text-gray-500">Transaction: {transactionRef}</p>
            )}

        <div className="mt-6 space-y-3">
          <Button className="w-full" onClick={() => navigate('/customer/orders')}>
            Track Order
          </Button>
          <Button variant="outline" className="w-full" onClick={() => navigate('/customer/new-order')}>
            Continue Shopping
          </Button>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderConfirmation;
