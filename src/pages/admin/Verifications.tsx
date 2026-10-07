import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SimplePagination from '@/components/ui/simple-pagination';
import { supabase } from '@/integrations/supabase/client';
import { STATUS_LABELS, type VerificationStatus } from '@/lib/verification';
import VerificationReviewDialog, { type VerificationRow } from '@/components/admin/verifications/VerificationReviewDialog';
import BusinessCategories from '@/components/admin/verifications/BusinessCategories';

const PAGE_SIZE = 20;
const STATUSES: VerificationStatus[] = ['pending', 'unverified', 'verified', 'rejected', 'suspended'];

// Admin: review vendor and rider verifications, and manage business categories
const Verifications = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<VerificationStatus>('pending');
  const [role, setRole] = useState<'all' | 'vendor' | 'rider'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<VerificationRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-verifications', status, role, page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      let q = supabase
        .from('verifications')
        .select(
          '*, profile:profiles!verifications_profile_id_fkey(name, email, phone, avatar, store_banner_url), category:business_categories(name)',
          { count: 'exact' },
        )
        .eq('status', status)
        .order('submitted_at', { ascending: status !== 'pending' ? false : true })
        .range(from, from + PAGE_SIZE - 1);
      if (role !== 'all') q = q.eq('role', role);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as VerificationRow[], total: count ?? 0 };
    },
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['admin-verifications-pending-count'],
    queryFn: async () => {
      const { count } = await supabase.from('verifications').select('profile_id', { count: 'exact', head: true }).eq('status', 'pending');
      return count ?? 0;
    },
  });

  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('admin-verifications') });
  const rows = data?.rows ?? [];
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <DashboardLayout userRole="ADMIN">
      <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-4 md:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl"><ShieldCheck className="h-6 w-6" /> Verifications</h1>
          <p className="text-sm text-muted-foreground">Review vendors and riders before they can trade or deliver.</p>
        </div>

        <Tabs defaultValue="requests">
          <TabsList>
            <TabsTrigger value="requests">
              Requests {pendingCount > 0 && <Badge className="ml-2 h-5 px-1.5">{pendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="categories">Business categories</TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={status} onValueChange={(v) => { setStatus(v as VerificationStatus); setPage(1); }}>
                <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={role} onValueChange={(v) => { setRole(v as typeof role); setPage(1); }}>
                <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Vendors and riders</SelectItem>
                  <SelectItem value="vendor">Vendors</SelectItem>
                  <SelectItem value="rider">Riders</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div>
                ) : rows.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">Nothing here.</p>
                ) : (
                  <ul className="divide-y">
                    {rows.map((r) => (
                      <li key={r.profile_id}>
                        <button type="button" onClick={() => setSelected(r)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/60">
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 font-medium">
                              {r.profile?.name || 'Unnamed'}
                              <Badge variant="outline" className="capitalize">{r.role}</Badge>
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {r.profile?.email} · {r.submitted_at ? format(new Date(r.submitted_at), 'd MMM yyyy') : '–'}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <SimplePagination page={page} pageCount={pageCount} onPageChange={setPage} />
          </TabsContent>

          <TabsContent value="categories">
            <BusinessCategories />
          </TabsContent>
        </Tabs>
      </div>

      <VerificationReviewDialog
        row={selected}
        onClose={() => setSelected(null)}
        onDone={() => { setSelected(null); refresh(); }}
      />
    </DashboardLayout>
  );
};

export default Verifications;
