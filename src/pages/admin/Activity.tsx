import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ScrollText } from 'lucide-react';
import AdminPage from '@/components/admin/AdminPage';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import { supabase } from '@/integrations/supabase/client';
import { PAGE_SIZE } from '@/lib/pagination';


const ACTIONS: Record<string, string> = {
  cancel_order: 'Cancelled and refunded an order',
  relieve_rider: 'Relieved a rider',
  reassign_order: 'Reassigned an order',
  unlock_handover_code: 'Unlocked a handover code',
  approve_payout: 'Approved a withdrawal',
  reject_payout: 'Rejected a withdrawal',
  update_pricing: 'Changed the prices',
  suspend_customer: 'Suspended a customer',
  reinstate_customer: 'Reinstated a customer',
  verification_verify: 'Verified a vendor or rider',
  verification_reject: 'Rejected a verification',
  verification_suspend: 'Suspended a vendor or rider',
  verification_reinstate: 'Reinstated a vendor or rider',
  hide_review: 'Hid a review',
  unhide_review: 'Showed a review again',
  retry_email: 'Resent an email',
  invite_admin: 'Invited an admin',
  resend_admin_invite: 'Resent an admin invite',
  remove_admin: 'Removed an admin',
};

const details = (v: Record<string, unknown> | null) => {
  if (!v) return null;
  const parts = [v.reason && `“${v.reason}”`, v.email, v.note && `Note: ${v.note}`, v.result && `Result: ${v.result}`,
    typeof v.amount !== 'undefined' && `₦${Number(v.amount).toLocaleString()}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
};

// Admin: who did what. Every admin action is recorded by the database.
const AdminActivity = () => {
  const [action, setAction] = useState('all');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-activity', action, page],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      let q = supabase.from('audit_logs')
        .select('id, action, target_type, target_id, new_values, created_at, admin:profiles!audit_logs_admin_id_fkey(name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (action !== 'all') q = q.eq('action', action);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  const rows = data?.rows ?? [];

  return (
    <AdminPage title="Activity log" icon={ScrollText} description="Every admin action, newest first.">
      <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
        <SelectTrigger className="sm:w-72" aria-label="Action"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All actions</SelectItem>
          {Object.entries(ACTIONS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="divide-y">
              {rows.map((l) => {
                const extra = details(l.new_values as Record<string, unknown> | null);
                return (
                  <li key={l.id} className="p-3 sm:px-4">
                    <p className="text-sm">
                      <span className="font-medium">{l.admin?.name ?? l.admin?.email ?? 'Admin'}</span>{' '}
                      <span className="text-muted-foreground">{(ACTIONS[l.action] ?? l.action.replace(/_/g, ' ')).replace(/^./, (c) => c.toLowerCase())}</span>
                      {l.target_type === 'order' && l.target_id && (
                        <> · <Link to={`/admin/orders/${l.target_id}`} className="text-primary hover:underline">view order</Link></>
                      )}
                    </p>
                    {extra && <p className="break-words text-xs text-muted-foreground">{extra}</p>}
                    <p className="text-xs text-muted-foreground">{format(new Date(l.created_at), 'd MMM yyyy, HH:mm')}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))} onPageChange={setPage} />
    </AdminPage>
  );
};

export default AdminActivity;
