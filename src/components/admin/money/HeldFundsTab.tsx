import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import SimplePagination from '@/components/ui/simple-pagination';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/pricing';
import { PAGE_SIZE } from '@/lib/pagination';


// Payments for orders still in progress: paid out to the vendor and rider on delivery,
// refunded if the order is cancelled
const HeldFundsTab = () => {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-held', page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error } = await supabase
        .from('payment_holds')
        .select('id, total_amount, vendor_amount, rider_amount, platform_fee, created_at, order:orders!inner(id, order_number, status, order_type)', { count: 'exact' })
        .eq('status', 'held')
        .order('created_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {data ? `${data.total} order${data.total === 1 ? '' : 's'} in progress.` : ''} The money is released to the vendor and rider
        when the order is delivered, or refunded if it's cancelled.
      </p>
      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">Nothing held right now.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((h) => (
                <li key={h.id}>
                  <Link to={`/admin/orders/${h.order.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/60 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">#{h.order.order_number} <OrderStatusBadge status={h.order.status} /></p>
                      <p className="text-xs text-muted-foreground">
                        Paid {format(new Date(h.created_at), 'd MMM, HH:mm')} · vendor {formatNaira(Number(h.vendor_amount))} · rider {formatNaira(Number(h.rider_amount))}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold">{formatNaira(Number(h.total_amount))}</p>
                  </Link>
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

export default HeldFundsTab;
