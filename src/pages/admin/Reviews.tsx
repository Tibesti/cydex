import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Eye, EyeOff, Star } from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import ReasonDialog from '@/components/admin/ReasonDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { PAGE_SIZE } from '@/lib/pagination';

type Kind = 'vendor' | 'rider';
type Review = {
  id: string; rating: number; feedback: string | null; created_at: string; hidden_at: string | null; hidden_reason: string | null;
  order_id: string; customer: { name: string | null } | null; target: { name: string | null } | null; order: { order_number: string } | null;
};

// Admin: every vendor and rider review. Hidden reviews are kept but no longer
// shown to others or counted in averages.
const AdminReviews = () => {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [kind, setKind] = useState<Kind>('vendor');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [hiding, setHiding] = useState<Review | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reviews', kind, filter, page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const table = kind === 'vendor' ? 'vendor_ratings' : 'rider_ratings';
      const from = (page - 1) * PAGE_SIZE;
      let q = supabase
        .from(table)
        .select(
          `id, rating, feedback, created_at, hidden_at, hidden_reason, order_id,
           customer:profiles!${table}_customer_id_fkey(name),
           target:profiles!${table}_${kind}_id_fkey(name),
           order:orders!${table}_order_id_fkey(order_number)`,
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (filter === 'hidden') q = q.not('hidden_at', 'is', null);
      if (filter === 'low') q = q.lte('rating', 2).is('hidden_at', null);
      if (filter === 'visible') q = q.is('hidden_at', null);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Review[], total: count ?? 0 };
    },
  });
  const rows = data?.rows ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });

  const unhide = async (r: Review) => {
    if (!(await confirm({
      title: 'Are you sure you want to show this review again?',
      description: `Everyone can see it again and it counts towards ${r.target?.name ?? 'their'} average.`,
      confirmLabel: 'Yes, show it',
    }))) return;
    const { error } = await supabase.rpc('admin_set_review_hidden', { p_kind: kind, p_id: r.id, p_hidden: false });
    if (error) return toast.error(errorMessage(error, 'Could not show the review'));
    toast.success('Review visible again');
    refresh();
  };

  return (
    <AdminPage title="Reviews" icon={Star} description="Hide fake or abusive reviews. Hidden ones are kept for the record but don't count in averages.">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={kind} onValueChange={(v) => { setKind(v as Kind); setPage(1); }}>
          <TabsList>
            <TabsTrigger value="vendor">Vendor reviews</TabsTrigger>
            <TabsTrigger value="rider">Rider reviews</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); }}>
          <SelectTrigger className="sm:w-48" aria-label="Show"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reviews</SelectItem>
            <SelectItem value="low">1–2 stars</SelectItem>
            <SelectItem value="visible">Visible</SelectItem>
            <SelectItem value="hidden">Hidden</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No reviews here.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-amber-500" aria-label={`${r.rating} stars`}>{'★'.repeat(r.rating)}<span className="text-muted-foreground/40">{'★'.repeat(5 - r.rating)}</span></span>
                      <span className="font-medium">{r.target?.name ?? (kind === 'vendor' ? 'Vendor' : 'Rider')}</span>
                      {r.hidden_at && <Badge variant="outline">Hidden</Badge>}
                    </p>
                    {r.feedback ? <p className={r.hidden_at ? 'text-sm text-muted-foreground line-through' : 'text-sm'}>“{r.feedback}”</p>
                      : <p className="text-sm italic text-muted-foreground">No comment</p>}
                    <p className="text-xs text-muted-foreground">
                      By {r.customer?.name ?? 'customer'} · {format(new Date(r.created_at), 'd MMM yyyy')} ·{' '}
                      <Link to={`/admin/orders/${r.order_id}`} className="text-primary hover:underline">#{r.order?.order_number ?? 'order'}</Link>
                    </p>
                    {r.hidden_at && r.hidden_reason && <p className="text-xs text-muted-foreground">Hidden: {r.hidden_reason}</p>}
                  </div>
                  {r.hidden_at ? (
                    <Button size="sm" variant="outline" onClick={() => unhide(r)}><Eye className="mr-1.5 h-4 w-4" /> Show</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setHiding(r)}><EyeOff className="mr-1.5 h-4 w-4" /> Hide</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))} onPageChange={setPage} />

      <ReasonDialog
        open={!!hiding}
        title="Are you sure you want to hide this review?"
        description={`Only the customer who wrote it and admins will see it, and it stops counting towards ${hiding?.target?.name ?? 'the'} average.`}
        confirmLabel="Yes, hide it"
        reasonLabel="Reason (for admins)"
        placeholder="e.g. Abusive language, or a fake review"
        destructive
        onClose={() => setHiding(null)}
        onConfirm={async (reason) => {
          const { error } = await supabase.rpc('admin_set_review_hidden', { p_kind: kind, p_id: hiding!.id, p_hidden: true, p_reason: reason });
          if (error) throw error;
          toast.success('Review hidden');
          setHiding(null);
          refresh();
        }}
      />
    </AdminPage>
  );
};

export default AdminReviews;
