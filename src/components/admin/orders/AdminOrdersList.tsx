import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { ORDER_STATUSES, orderStatusLabel } from '@/lib/orderStatus';
import { formatNaira } from '@/lib/pricing';
import PaymentStatusBadge from '../PaymentStatusBadge';
import { PAGE_SIZE } from '@/lib/pagination';


// Every order and rider request, newest first. Filters live in the URL so the
// Overview can link straight to "waiting for a rider" etc.
const AdminOrdersList = () => {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'all';
  const type = params.get('type') ?? 'all';
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(search);

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === 'all' || v === '') p.delete(k);
      else p.set(k, v);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', debounced, status, type, page],
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_orders', {
        p_search: debounced || undefined,
        p_status: status === 'all' ? undefined : status,
        p_order_type: type === 'all' ? undefined : type,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Order number, customer, vendor, rider or recipient"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <Select value={status} onValueChange={(v) => update({ status: v })}>
            <SelectTrigger className="md:w-52" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{orderStatusLabel(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => update({ type: v })}>
            <SelectTrigger className="md:w-44" aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="customer">Customer orders</SelectItem>
              <SelectItem value="rider_request">Rider requests</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{isLoading ? 'Loading…' : `${total} order${total === 1 ? '' : 's'}`}</p>

      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No orders match.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((o) => {
                const isRequest = o.order_type === 'rider_request';
                return (
                  <li key={o.id}>
                    <Link to={`/admin/orders/${o.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/60 sm:px-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">#{o.order_number}</span>
                          {isRequest && <Badge variant="outline">Rider request</Badge>}
                          <OrderStatusBadge status={o.status} />
                          <PaymentStatusBadge status={o.payment_status} />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {isRequest
                            ? `${o.vendor_name ?? 'Vendor'} → ${o.recipient_name ?? 'recipient'}`
                            : `${o.customer_name ?? 'Customer'} · ${o.vendor_name ?? 'Vendor'} · ${o.item_count} item${Number(o.item_count) === 1 ? '' : 's'}`}
                          {o.rider_name ? ` · Rider: ${o.rider_name}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">{formatNaira(Number(o.total_amount))}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(o.created_at), 'd MMM, HH:mm')}</p>
                      </div>
                      <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground xs:block" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={pageCount} onPageChange={(p) => update({ page: String(p) })} />
    </div>
  );
};

export default AdminOrdersList;
