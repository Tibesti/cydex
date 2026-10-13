import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Layers, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { invokeFunction } from '@/lib/edgeFunctions';
import { formatNaira } from '@/lib/pricing';

interface Props {
  batchId: string;
  /** Squad's reference when the vendor has just come back from paying */
  transactionRef: string | null;
  onClose: () => void;
}

// One batch of rider requests: its drop-offs, paying what's left by card, and
// cancelling it before a rider accepts
const BatchPanel = ({ batchId, transactionRef, onClose }: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const verified = useRef(false);

  const { data, refetch } = useQuery({
    queryKey: ['rider-requests', 'batch', batchId],
    refetchInterval: 15000,
    queryFn: async () => {
      const [{ data: batch }, { data: stops, error }] = await Promise.all([
        supabase.from('rider_request_batches').select('id, batch_number').eq('id', batchId).maybeSingle(),
        supabase.from('orders')
          .select('id, order_number, status, payment_status, total_amount, wallet_amount, batch_seq, rider_id, delivery_address')
          .eq('batch_id', batchId).order('batch_seq'),
      ]);
      if (error) throw error;
      return { batch, stops: stops ?? [] };
    },
  });

  // Back from Squad: confirm the card payment for the batch
  useEffect(() => {
    if (!transactionRef || verified.current) return;
    verified.current = true;
    setVerifying(true);
    invokeFunction<{ status: string }>('squad-checkout', { action: 'verify', transaction_ref: transactionRef })
      .then(({ status }) => {
        if (status === 'paid' || status === 'already_paid') toast.success('Payment confirmed. Nearby riders have been notified.');
        else toast.error("We couldn't confirm the payment yet.");
      })
      .catch((e) => toast.error(errorMessage(e, 'Could not confirm the payment')))
      .finally(() => {
        setVerifying(false);
        refetch();
        queryClient.invalidateQueries({ queryKey: ['rider-requests'] });
      });
  }, [transactionRef, refetch, queryClient]);

  const stops = data?.stops ?? [];
  const unpaid = stops.filter((s) => s.status === 'pending' && ['pending', 'failed'].includes(s.payment_status));
  const due = unpaid.reduce((sum, s) => sum + Number(s.total_amount) - Number(s.wallet_amount ?? 0), 0);
  const cancellable = stops.some((s) => ['pending', 'ready_for_pickup'].includes(s.status) && !s.rider_id);
  const total = stops.reduce((sum, s) => sum + Number(s.total_amount), 0);

  const pay = async () => {
    if (!data?.batch) return;
    setBusy(true);
    try {
      const { checkout_url } = await invokeFunction<{ checkout_url: string }>('squad-checkout', {
        action: 'initiate', order_number: data.batch.batch_number,
      });
      window.location.href = checkout_url;
    } catch (e) {
      toast.error(errorMessage(e, 'Could not start the payment'));
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!(await confirm({
      title: 'Are you sure you want to cancel this batch?',
      description: 'Every drop-off no rider has accepted is cancelled, and what you paid for them goes back to your wallet.',
      confirmLabel: 'Yes, cancel the batch',
      destructive: true,
    }))) return;
    setBusy(true);
    const { error } = await supabase.rpc('cancel_rider_batch', { p_batch_id: batchId });
    setBusy(false);
    if (error) return toast.error(errorMessage(error, 'Could not cancel the batch'));
    toast.success('Batch cancelled');
    refetch();
    queryClient.invalidateQueries({ queryKey: ['rider-requests'] });
  };

  if (!data) return <div className="h-32 animate-pulse rounded-lg bg-muted" />;

  return (
    <Card className="border-primary/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> Batch {data.batch?.batch_number ?? ''}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close batch">
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
        <CardDescription>
          {stops.length} drop-offs · {formatNaira(total)} · one rider collects them together with one pickup code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {verifying && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Confirming your payment…
          </p>
        )}
        {due > 0 && !verifying && (
          <div className="flex flex-col gap-2 rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-500/10 sm:flex-row sm:items-center sm:justify-between">
            <span>Pay {formatNaira(due)} by card to send this batch to riders.</span>
            <Button size="sm" onClick={pay} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Pay {formatNaira(due)}
            </Button>
          </div>
        )}
        <ul className="divide-y rounded-lg border">
          {stops.map((s) => {
            const to = (s.delivery_address ?? {}) as Record<string, string>;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => navigate(`/vendor/rider-requests/${s.id}`)}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/60">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold">{s.batch_seq}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {to.name || 'Customer'}
                      {s.status === 'pending' && s.payment_status !== 'paid'
                        ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">Awaiting payment</span>
                        : <OrderStatusBadge status={s.status} className="text-xs" />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{to.street || to.formatted_address}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{formatNaira(Number(s.total_amount))}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">Open a drop-off for its delivery code to share with that customer.</p>
        {cancellable && (
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={cancel} disabled={busy}>
            Cancel batch
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default BatchPanel;
