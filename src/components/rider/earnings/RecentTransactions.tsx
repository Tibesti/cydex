import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PagedList from '@/components/ui/paged-list';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { RiderPayoutRequest } from '@/hooks/useRiderWallet';
import { formatNaira } from '@/lib/pricing';
import { cn } from '@/lib/utils';

const WITHDRAWAL_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Waiting for approval', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300' },
  processing: { label: 'Sent to your bank', className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' },
  completed: { label: 'Paid', className: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' },
  failed: { label: 'Failed, money returned', className: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  cancelled: { label: 'Not approved, money returned', className: 'bg-muted text-muted-foreground' },
};

type Row =
  | { kind: 'earning'; id: string; at: string; title: string; amount: number }
  | { kind: 'withdrawal'; id: string; at: string; title: string; amount: number; status: string; reason?: string | null };

// Delivery earnings and withdrawals together, newest first
const RecentTransactions = ({ payoutRequests }: { payoutRequests: RiderPayoutRequest[] }) => {
  const { user } = useAuth();
  const { data: earnings = [] } = useQuery({
    queryKey: ['rider-earning-transactions', user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rider_transactions')
        .select('id, amount, net_amount, description, created_at')
        .eq('rider_id', user!.id)
        .eq('type', 'earning')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo<Row[]>(() => [
    ...earnings.map((t) => ({
      kind: 'earning' as const,
      id: t.id,
      at: t.created_at,
      title: t.description || 'Delivery',
      amount: Number(t.net_amount ?? t.amount ?? 0),
    })),
    ...payoutRequests.map((p) => ({
      kind: 'withdrawal' as const,
      id: p.id,
      at: p.created_at,
      title: 'Withdrawal to bank',
      amount: Number(p.amount),
      status: p.status,
      reason: p.failure_reason,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()), [earnings, payoutRequests]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          Recent Transactions
          <Badge variant="outline" className="text-xs">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No transactions yet</p>
        ) : (
          <div className="divide-y">
            <PagedList items={rows} getKey={(r) => `${r.kind}-${r.id}`} paginationClassName="pt-2" render={(r) => (
              <div className="flex items-center gap-3 py-2">
                <span className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  r.kind === 'earning' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-muted text-muted-foreground',
                )}>
                  {r.kind === 'earning' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(r.at), 'd MMM yyyy, HH:mm')}</p>
                  {r.kind === 'withdrawal' && (
                    <>
                      <Badge variant="outline" className={cn('mt-1 border-transparent px-1.5 py-0 text-[10px]', WITHDRAWAL_STATUS[r.status]?.className)}>
                        {WITHDRAWAL_STATUS[r.status]?.label ?? r.status}
                      </Badge>
                      {r.reason && (r.status === 'failed' || r.status === 'cancelled') && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Reason: {r.reason}</p>
                      )}
                    </>
                  )}
                </div>
                <p className={cn(
                  'shrink-0 text-xs font-semibold',
                  r.kind === 'earning' ? 'text-green-700 dark:text-green-400' : 'text-foreground',
                )}>
                  {r.kind === 'earning' ? '+' : '−'}{formatNaira(r.amount)}
                </p>
              </div>
            )} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentTransactions;
