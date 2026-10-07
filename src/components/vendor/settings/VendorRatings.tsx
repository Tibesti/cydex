import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { MessageSquare, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import SimplePagination from '@/components/ui/simple-pagination';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

interface Review {
  id: string;
  rating: number;
  delivery_rating: number | null;
  product_quality_rating: number | null;
  feedback: string | null;
  created_at: string | null;
  customer: { name: string | null } | null;
  order: { order_number: string } | null;
}

const Stars = ({ value, className }: { value: number; className?: string }) => (
  <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star
        key={i}
        className={cn('h-4 w-4', i <= Math.round(value) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40')}
      />
    ))}
  </span>
);

// The vendor's ratings and reviews from customers, newest first
const VendorRatings = () => {
  const { user } = useAuth();
  const [page, setPage] = useState(1);

  const { data: summary } = useQuery({
    queryKey: ['vendor-rating-summary', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_vendor_average_rating', { vendor_uuid: user!.id });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-reviews', user?.id, page],
    enabled: !!user?.id,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const { data, count, error } = await supabase
        .from('vendor_ratings')
        .select(
          'id, rating, delivery_rating, product_quality_rating, feedback, created_at, customer:profiles!customer_id(name), order:orders!order_id(order_number)',
          { count: 'exact' },
        )
        .eq('vendor_id', user!.id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { reviews: (data ?? []) as unknown as Review[], total: count ?? 0 };
    },
  });

  const total = Number(summary?.total_ratings ?? data?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Overall rating</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-bold">{Number(summary?.average_rating ?? 0).toFixed(1)}</span>
            <Stars value={Number(summary?.average_rating ?? 0)} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {total} {total === 1 ? 'rating' : 'ratings'}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Delivery</p>
          <p className="mt-1 text-2xl font-bold">{Number(summary?.average_delivery_rating ?? 0).toFixed(1)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Product quality</p>
          <p className="mt-1 text-2xl font-bold">{Number(summary?.average_product_quality_rating ?? 0).toFixed(1)}</p>
        </div>
      </div>

      {/* Reviews */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : !data?.reviews.length ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border p-8 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8" />
          <p>No ratings yet. Customers can rate you after their orders.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.reviews.map((r) => (
            <li key={r.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Stars value={r.rating} />
                <span className="text-xs text-muted-foreground">
                  {r.created_at ? format(new Date(r.created_at), 'd MMM yyyy') : ''}
                </span>
              </div>
              {r.feedback ? (
                <p className="mt-2 whitespace-pre-line break-words text-sm">{r.feedback}</p>
              ) : (
                <p className="mt-2 text-sm italic text-muted-foreground">No written review</p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{r.customer?.name || 'Customer'}</span>
                {r.order?.order_number && <span>Order #{r.order.order_number}</span>}
                {r.delivery_rating != null && <span>Delivery {r.delivery_rating}/5</span>}
                {r.product_quality_rating != null && <span>Quality {r.product_quality_rating}/5</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <SimplePagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
};

export default VendorRatings;
