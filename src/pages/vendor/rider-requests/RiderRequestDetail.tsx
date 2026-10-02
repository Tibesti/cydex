import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Loader2, MapPin, Package, Phone, Truck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import HandoverCodeCard from '@/components/orders/HandoverCodeCard';
import HandoverCodeDialog from '@/components/orders/HandoverCodeDialog';
import { supabase } from '@/integrations/supabase/client';
import { orderActions } from '@/services/orderActions';
import { invokeFunction } from '@/lib/edgeFunctions';
import { errorMessage } from '@/lib/address';
import { formatNaira } from '@/lib/pricing';
import { isValidPhone } from '@/lib/phone';

const FINAL = ['delivered', 'cancelled', 'rejected'];

// One rider request: status, the delivery code for the customer, the rider,
// handing over (pickup code), payment and cancelling. Squad returns here after
// a card payment (?transaction_ref=...).
const RiderRequestDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [verifying, setVerifying] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [handover, setHandover] = useState(false);
  const verified = useRef(false);

  const { data: order, isLoading, refetch } = useQuery({
    queryKey: ['rider-request', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, rider:profiles!orders_rider_id_fkey(name, phone)')
        .eq('id', orderId!)
        .eq('order_type', 'rider_request')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (q.state.data && FINAL.includes(q.state.data.status) ? false : 15000),
  });

  // Back from Squad: confirm the card payment
  useEffect(() => {
    const ref = searchParams.get('transaction_ref');
    if (!ref || verified.current) return;
    verified.current = true;
    setVerifying(true);
    invokeFunction<{ status: string }>('squad-checkout', { action: 'verify', transaction_ref: ref })
      .then(({ status }) => {
        if (status === 'paid' || status === 'already_paid') toast.success('Payment confirmed. Nearby riders have been notified.');
        else if (status === 'refunded') toast.info('This request was cancelled, so the payment went back to your wallet.');
        else toast.error("We couldn't confirm the payment yet.");
      })
      .catch((e) => toast.error(errorMessage(e, 'Could not confirm the payment')))
      .finally(() => {
        setVerifying(false);
        setSearchParams({}, { replace: true });
        refetch();
      });
  }, [searchParams, setSearchParams, refetch]);

  const refresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['rider-requests'] });
  };

  if (isLoading) {
    return (
      <DashboardLayout userRole="VENDOR">
        <div className="mx-auto max-w-3xl space-y-3 p-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}
        </div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout userRole="VENDOR">
        <div className="mx-auto max-w-3xl p-4 text-center">
          <p className="mb-4 text-muted-foreground">Request not found.</p>
          <Button onClick={() => navigate('/vendor/rider-requests')}>Back to requests</Button>
        </div>
      </DashboardLayout>
    );
  }

  const to = (order.delivery_address ?? {}) as Record<string, string>;
  const rider = order.rider as { name: string | null; phone: string | null } | null;
  const cardAmount = Number(order.total_amount) - Number(order.wallet_amount);
  const awaitingPayment = order.status === 'pending' && (order.payment_status === 'pending' || order.payment_status === 'failed');
  const canCancel = ['pending', 'ready_for_pickup'].includes(order.status) && !order.rider_id;

  const payByCard = async () => {
    setPaying(true);
    try {
      const { checkout_url } = await invokeFunction<{ checkout_url: string }>('squad-checkout', {
        action: 'initiate',
        order_number: order.order_number,
      });
      window.location.href = checkout_url;
    } catch (e) {
      toast.error(errorMessage(e, 'Could not start the payment'));
      setPaying(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      await orderActions.cancelRiderRequest(order.id);
      toast.success('Request cancelled. What you paid is back in your wallet.');
      setConfirmCancel(false);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not cancel the request'));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <DashboardLayout userRole="VENDOR">
      <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-4 md:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/vendor/rider-requests')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Rider requests
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Request #{order.order_number}</h1>
            <p className="text-sm text-muted-foreground">{format(new Date(order.created_at), 'd MMM yyyy, h:mm a')}</p>
          </div>
          {awaitingPayment ? (
            <span className="w-fit rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
              Awaiting payment
            </span>
          ) : (
            <OrderStatusBadge status={order.status} />
          )}
        </div>

        {verifying && (
          <Card className="flex items-center gap-2 p-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Confirming your payment…
          </Card>
        )}

        {awaitingPayment && !verifying && (
          <Card className="space-y-3 border-amber-300 p-4 dark:border-amber-500/40">
            <p className="text-sm">
              {Number(order.wallet_amount) > 0
                ? `${formatNaira(Number(order.wallet_amount))} was taken from your wallet. Pay the remaining ${formatNaira(cardAmount)} by card to send the request to riders.`
                : `Pay ${formatNaira(cardAmount)} by card to send the request to riders.`}
            </p>
            <Button onClick={payByCard} disabled={paying} className="w-full sm:w-auto">
              {paying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pay {formatNaira(cardAmount)} by card
            </Button>
          </Card>
        )}

        {/* The code the customer gives the rider */}
        <HandoverCodeCard
          orderId={order.id}
          kind="delivery"
          hint={`Send this code to ${to.name || 'your customer'}. They give it to the rider when the package arrives.`}
        />

        {/* Rider and handing over */}
        {rider && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4" /> Rider</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium">{rider.name || 'Rider'}</span>
                {isValidPhone(rider.phone) && (
                  <a href={`tel:${rider.phone}`} className="flex items-center gap-1 hover:underline">
                    <Phone className="h-3.5 w-3.5" /> {rider.phone}
                  </a>
                )}
              </div>
              {(order.status === 'rider_assigned' || order.status === 'picking_up') && (
                <>
                  <p className="text-muted-foreground">When the rider arrives, enter the pickup code they give you.</p>
                  <Button onClick={() => setHandover(true)} className="w-full sm:w-auto">Hand to rider</Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {order.status === 'ready_for_pickup' && !rider && (
          <Card className="p-4 text-sm text-muted-foreground">Waiting for a nearby rider to accept…</Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2"><UserRound className="h-4 w-4 text-muted-foreground" /> {to.name}</p>
            {to.phone && (
              <a href={`tel:${to.phone}`} className="flex items-center gap-2 hover:underline">
                <Phone className="h-4 w-4 text-muted-foreground" /> {to.phone}
              </a>
            )}
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="break-words">{to.formatted_address}</span>
            </p>
            {to.additional_info && <p className="break-words pl-6 text-muted-foreground">Directions: {to.additional_info}</p>}
            {order.special_instructions && (
              <p className="flex items-start gap-2">
                <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="break-words">{order.special_instructions}</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cost</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery ({Number(order.distance_km ?? 0).toFixed(1)} km)</span>
              <span>{formatNaira(Number(order.delivery_fee))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cydex commission</span>
              <span>{formatNaira(Number(order.service_charge))}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatNaira(Number(order.total_amount))}</span>
            </div>
            <div className="flex justify-between pt-1 text-muted-foreground">
              <span>From wallet</span>
              <span>{formatNaira(Number(order.wallet_amount))}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>By card</span>
              <span>{formatNaira(cardAmount)}</span>
            </div>
            {order.payment_status === 'refunded' && (
              <p className="pt-1 text-xs text-muted-foreground">Refunded to your wallet.</p>
            )}
          </CardContent>
        </Card>

        {canCancel && (
          <Button variant="outline" className="w-full text-destructive sm:w-auto" onClick={() => setConfirmCancel(true)}>
            Cancel request
          </Button>
        )}
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={(o) => !cancelling && setConfirmCancel(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
            <AlertDialogDescription>Everything you've paid for it goes back to your wallet.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep request</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); cancel(); }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HandoverCodeDialog
        open={handover}
        onOpenChange={setHandover}
        title="Hand package to rider"
        description="Ask the rider for their 4-digit pickup code."
        confirmLabel="Confirm pickup"
        onSubmit={(code) => orderActions.confirmPickup(order.id, code)}
        onConfirmed={refresh}
      />
    </DashboardLayout>
  );
};

export default RiderRequestDetail;
