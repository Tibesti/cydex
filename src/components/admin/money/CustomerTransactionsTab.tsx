import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/pricing';
import { PAGE_SIZE } from '@/lib/pagination';

const TYPES = ['payment', 'refund', 'bonus', 'reward', 'adjustment'];

// Customers' wallet history (payments, refunds, top-ups). Read-only: refunds
// happen automatically when orders are cancelled or rejected.
const CustomerTransactionsTab = () => {
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-customer-transactions', type, page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      let q = supabase
        .from('customer_transactions')
        .select('id, type, amount, status, description, reference_id, created_at, customer:profiles!customer_transactions_customer_id_fkey(name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (type !== 'all') q = q.eq('type', type);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-3">
      <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
        <SelectTrigger className="xs:w-48" aria-label="Type"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
        </SelectContent>
      </Select>
      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No transactions.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((t) => (
                <li key={t.id} className="flex items-center gap-3 p-3 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="truncate">{t.customer?.name ?? 'Customer'}</span>
                      <Badge variant="outline" className="capitalize">{t.type}</Badge>
                      {t.status !== 'completed' && <Badge variant="secondary" className="capitalize">{t.status}</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.description}{t.reference_id && <> · <Link to={`/admin/orders/${t.reference_id}`} className="text-primary hover:underline">order</Link></>}
                    </p>
                    <p className="text-xs text-muted-foreground">{format(new Date(t.created_at), 'd MMM yyyy, HH:mm')}</p>
                  </div>
                  <p className="shrink-0 font-semibold">{formatNaira(Number(t.amount))}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))} onPageChange={setPage} />
    </div>
  );
};

export default CustomerTransactionsTab;
