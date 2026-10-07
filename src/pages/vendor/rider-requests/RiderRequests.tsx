import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Bike, ChevronRight, MapPin, Plus } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import SimplePagination from '@/components/ui/simple-pagination';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { formatNaira } from '@/lib/pricing';

const PAGE_SIZE = 10;

// The vendor's requests for a rider to deliver their own customers' orders
const RiderRequests = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['rider-requests', user?.id, page],
    enabled: !!user?.id,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error } = await supabase
        .from('orders')
        .select('id, order_number, status, payment_status, total_amount, created_at, delivery_address', { count: 'exact' })
        .eq('vendor_id', user!.id)
        .eq('order_type', 'rider_request')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { items: data ?? [], total: count ?? 0 };
    },
  });

  const items = data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <DashboardLayout userRole="VENDOR">
      <div className="mx-auto max-w-4xl space-y-4 p-3 sm:p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Request a Rider</h1>
            <p className="text-sm text-muted-foreground">
              Got an order outside the app? Request a Cydex rider to deliver it to your customer.
            </p>
          </div>
          <Button onClick={() => navigate('/vendor/rider-requests/new')} className="w-full sm:w-auto">
            <Plus className="mr-1 h-4 w-4" />
            New request
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded bg-muted" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <Bike className="h-10 w-10 opacity-50" />
                <p>No rider requests yet.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((r) => {
                  const to = (r.delivery_address ?? {}) as Record<string, string>;
                  const awaitingPayment = r.status === 'pending' && r.payment_status === 'pending';
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/vendor/rider-requests/${r.id}`)}
                        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/60"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">#{r.order_number}</span>
                            {awaitingPayment ? (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                                Awaiting payment
                              </span>
                            ) : (
                              <OrderStatusBadge status={r.status} className="text-xs" />
                            )}
                          </div>
                          <p className="break-words text-xs text-muted-foreground">
                            To {to.name || 'customer'} <MapPin className="inline h-3 w-3" /> {to.street || to.formatted_address}
                          </p>
                          <p className="text-xs text-muted-foreground">{format(new Date(r.created_at), 'd MMM yyyy, h:mm a')}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold">{formatNaira(Number(r.total_amount))}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <SimplePagination page={page} pageCount={pageCount} onPageChange={setPage} />
      </div>
    </DashboardLayout>
  );
};

export default RiderRequests;
