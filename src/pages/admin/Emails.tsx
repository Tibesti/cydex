import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Mail, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { cn } from '@/lib/utils';
import { PAGE_SIZE } from '@/lib/pagination';

const STATUS: Record<string, { label: string; className: string }> = {
  failed: { label: 'Failed', className: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  pending: { label: 'Queued', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300' },
  sent: { label: 'Sent', className: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' },
};

// Admin: emails the app sends (welcome, payment, refund, verification...). The
// send-emails job sends queued ones every minute and gives up after 5 tries.
const AdminEmails = () => {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('failed');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-emails', status, page],
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      let q = supabase.from('email_outbox')
        .select('id, to_email, template, subject, status, attempts, last_error, created_at, sent_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (status !== 'all') q = q.eq('status', status);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  const rows = data?.rows ?? [];

  const retry = async (id: string, to: string) => {
    if (!(await confirm({
      title: `Are you sure you want to resend this email to ${to}?`,
      description: 'It goes back in the queue and is sent within a minute.',
      confirmLabel: 'Yes, resend',
    }))) return;
    const { error } = await supabase.rpc('admin_retry_email', { p_id: id });
    if (error) return toast.error(errorMessage(error, 'Could not retry'));
    toast.success('Queued again');
    queryClient.invalidateQueries({ queryKey: ['admin-emails'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
  };

  return (
    <AdminPage title="Emails" icon={Mail} description="Emails Cydex sends. Failed ones can be sent again.">
      <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
        <SelectTrigger className="xs:w-44" aria-label="Status"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="failed">Failed</SelectItem>
          <SelectItem value="pending">Queued</SelectItem>
          <SelectItem value="sent">Sent</SelectItem>
          <SelectItem value="all">All emails</SelectItem>
        </SelectContent>
      </Select>
      <Card>
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded bg-muted" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">{status === 'failed' ? 'No failed emails.' : 'No emails here.'}</p>
          ) : (
            <ul className="divide-y">
              {rows.map((e) => (
                <li key={e.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">{e.subject}</span>
                      <Badge variant="outline" className={cn('border-transparent', STATUS[e.status]?.className)}>{STATUS[e.status]?.label ?? e.status}</Badge>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">To {e.to_email} · {e.template.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      Queued {format(new Date(e.created_at), 'd MMM, HH:mm')}
                      {e.sent_at && ` · Sent ${format(new Date(e.sent_at), 'd MMM, HH:mm')}`}
                      {e.attempts > 0 && e.status !== 'sent' && ` · ${e.attempts} ${e.attempts === 1 ? 'try' : 'tries'}`}
                    </p>
                    {e.last_error && e.status !== 'sent' && <p className="break-words text-xs text-destructive">{e.last_error}</p>}
                  </div>
                  {e.status === 'failed' && (
                    <Button size="sm" variant="outline" onClick={() => retry(e.id, e.to_email)}>
                      <RotateCw className="mr-1.5 h-4 w-4" /> Retry
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))} onPageChange={setPage} />
    </AdminPage>
  );
};

export default AdminEmails;
