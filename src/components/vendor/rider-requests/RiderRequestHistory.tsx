import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Bike, ChevronRight } from 'lucide-react';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { Button } from '@/components/ui/button';
import PagedList from '@/components/ui/paged-list';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/pricing';

// The vendor's rider requests inside their order history (Orders -> Rider requests)
const RiderRequestHistory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['rider-requests', user?.id, 'history'],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, status, payment_status, total_amount, created_at, delivered_at, delivery_address, batch_id, batch_seq')
        .eq('vendor_id', user!.id)
        .eq('order_type', 'rider_request')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded bg-muted" />)}</div>;
  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <Bike className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-medium">No rider requests yet</h3>
        <p className="mb-4 text-muted-foreground">Deliveries you request for your own customers show up here.</p>
        <Button onClick={() => navigate('/vendor/rider-requests/new')}>Request a rider</Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <PagedList items={items} getKey={(r) => r.id} render={(r) => {
        const to = (r.delivery_address ?? {}) as Record<string, string>;
        return (
          <button
            type="button"
            onClick={() => navigate(r.batch_id ? `/vendor/rider-requests?batch=${r.batch_id}` : `/vendor/rider-requests/${r.id}`)}
            className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">#{r.order_number}</span>
                {r.batch_id && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium">Batch · drop-off {r.batch_seq}</span>}
                {r.status === 'pending' && r.payment_status !== 'paid'
                  ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">Awaiting payment</span>
                  : <OrderStatusBadge status={r.status} className="text-xs" />}
              </div>
              <p className="truncate text-xs text-muted-foreground">To {to.name || 'customer'} · {to.street || to.formatted_address}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), 'd MMM yyyy, h:mm a')}</p>
            </div>
            <span className="shrink-0 text-sm font-semibold">{formatNaira(Number(r.total_amount))}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        );
      }} />
    </div>
  );
};

export default RiderRequestHistory;
