import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, Landmark, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { invokeFunction } from '@/lib/edgeFunctions';
import { formatNaira } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import ReasonDialog from '../ReasonDialog';
import { PAGE_SIZE } from '@/lib/pagination';

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Waiting for approval', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300' },
  processing: { label: 'Sent, waiting for bank', className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' },
  completed: { label: 'Paid', className: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' },
  failed: { label: 'Failed (money returned)', className: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  cancelled: { label: 'Rejected (money returned)', className: 'bg-muted text-muted-foreground' },
};

type Payout = { role: string; id: string; owner_name: string | null; owner_email: string | null; bank_name: string | null; account_number: string | null; account_name: string | null; amount: number; fee: number | null; net_amount: number | null; status: string; failure_reason: string | null; created_at: string; processed_at: string | null };

// Withdrawals: money leaves the wallet when requested; nothing is sent until an admin approves
const PayoutsTab = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [approving, setApproving] = useState<Payout | null>(null);
  const [rejecting, setRejecting] = useState<Payout | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-payouts', status, page],
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_payouts', {
        p_status: status === 'all' ? undefined : status, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as (Payout & { total_count: number })[];
    },
  });
  const total = Number(rows[0]?.total_count ?? 0);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
  };

  const approve = async (p: Payout) => {
    setBusy(p.id);
    try {
      await invokeFunction('squad-payout', { action: 'approve', role: p.role, payout_id: p.id });
      toast.success(`Sent ${formatNaira(Number(p.net_amount ?? p.amount))} to ${p.owner_name ?? 'them'}`);
    } catch (e) {
      toast.error(errorMessage(e, 'The transfer failed'));
    } finally {
      setBusy(null);
      setApproving(null);
      refresh();
    }
  };

  const check = async (p: Payout) => {
    setBusy(p.id);
    try {
      const { payout } = await invokeFunction<{ payout: { status: string } }>('squad-payout', { action: 'requery', role: p.role, payout_id: p.id });
      toast.info(`Status: ${STATUS[payout.status]?.label ?? payout.status}`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not check with Squad'));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <div className="space-y-3">
      <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
        <SelectTrigger className="xs:w-60" aria-label="Status"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          <SelectItem value="all">All withdrawals</SelectItem>
        </SelectContent>
      </Select>

      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No withdrawals here.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {p.owner_name ?? 'Unknown'}
                      <Badge variant="outline" className="capitalize">{p.role}</Badge>
                      <Badge variant="outline" className={cn('border-transparent', STATUS[p.status]?.className)}>{STATUS[p.status]?.label ?? p.status}</Badge>
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Landmark className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{p.bank_name ?? 'No bank'} · {p.account_number ?? '–'} · {p.account_name ?? '–'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested {format(new Date(p.created_at), 'd MMM yyyy, HH:mm')}
                      {p.processed_at && ` · Closed ${format(new Date(p.processed_at), 'd MMM, HH:mm')}`}
                    </p>
                    {p.failure_reason && <p className="text-xs text-destructive">{p.failure_reason}</p>}
                  </div>
                  <div className="flex items-center justify-between gap-3 md:flex-col md:items-end">
                    <div className="text-right">
                      <p className="text-lg font-bold">{formatNaira(Number(p.amount))}</p>
                      {Number(p.fee) > 0 && <p className="text-xs text-muted-foreground">{formatNaira(Number(p.net_amount))} after fee</p>}
                    </div>
                    <div className="flex gap-2">
                      {p.status === 'pending' && (
                        <>
                          <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => setRejecting(p)}>
                            <X className="mr-1 h-4 w-4" /> Reject
                          </Button>
                          <Button size="sm" disabled={busy === p.id} onClick={() => setApproving(p)}>
                            <Check className="mr-1 h-4 w-4" /> Approve
                          </Button>
                        </>
                      )}
                      {p.status === 'processing' && (
                        <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => check(p)}>
                          {busy === p.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Check status
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />

      <AlertDialog open={!!approving} onOpenChange={(o) => !o && !busy && setApproving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to send {formatNaira(Number(approving?.net_amount ?? approving?.amount ?? 0))}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Squad sends it from Cydex's balance to:</p>
                <p className="rounded-md bg-muted p-3 text-foreground">
                  {approving?.account_name}<br />{approving?.bank_name} · {approving?.account_number}
                </p>
                <p>If the bank rejects it, the money goes back to {approving?.owner_name ?? 'their'} wallet.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Back</AlertDialogCancel>
            <AlertDialogAction disabled={!!busy} onClick={(e) => { e.preventDefault(); if (approving) approve(approving); }}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Yes, approve and send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReasonDialog
        open={!!rejecting}
        title={`Are you sure you want to reject this ${formatNaira(Number(rejecting?.amount ?? 0))} withdrawal?`}
        description={`The money goes back to ${rejecting?.owner_name ?? 'their'} wallet, and they see your reason.`}
        confirmLabel="Yes, reject"
        placeholder="e.g. The account name doesn't match the profile"
        destructive
        onClose={() => setRejecting(null)}
        onConfirm={async (reason) => {
          const { error } = await supabase.rpc('admin_reject_payout', { p_role: rejecting!.role, p_id: rejecting!.id, p_reason: reason });
          if (error) throw error;
          toast.success('Withdrawal rejected, money returned');
          setRejecting(null);
          refresh();
        }}
      />
    </div>
  );
};

export default PayoutsTab;
