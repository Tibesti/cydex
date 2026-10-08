import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SimplePagination from '@/components/ui/simple-pagination';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { nairaWhole, periodRange, PERIOD_LABELS, type Period } from '@/lib/adminPeriod';
import { formatNaira } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import PeriodFilter from '../PeriodFilter';
import { PAGE_SIZE } from '@/lib/pagination';

type Row = NonNullable<Awaited<ReturnType<typeof fetchPage>>>[number];

const fetchPage = async (from: string | null, to: string | null, type: string, limit: number, offset: number) => {
  const { data, error } = await supabase.rpc('admin_earnings', {
    p_from: from ?? undefined, p_to: to ?? undefined, p_order_type: type === 'all' ? undefined : type,
    p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return data ?? [];
};

const COLUMNS: { key: keyof Row; label: string; cydex?: boolean }[] = [
  { key: 'amount_paid', label: 'Paid' },
  { key: 'vendor_got', label: 'Vendor got' },
  { key: 'rider_got', label: 'Rider got' },
  { key: 'cydex_from_customer', label: 'Cydex from customer', cydex: true },
  { key: 'cydex_from_vendor', label: 'Cydex from vendor', cydex: true },
  { key: 'cydex_from_rider', label: 'Cydex from rider', cydex: true },
  { key: 'cydex_total', label: 'Cydex total', cydex: true },
];

// Every delivered order's money: who paid, what the vendor and rider got and
// what Cydex kept from each side. Refunded orders aren't here (nothing was kept).
const EarningsTab = () => {
  const [period, setPeriod] = useState<Period>({ preset: 'this_month' });
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const { from, to } = periodRange(period);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-earnings', from, to, type, page],
    placeholderData: (previous) => previous,
    queryFn: () => fetchPage(from, to, type, PAGE_SIZE, (page - 1) * PAGE_SIZE),
  });

  const first = rows[0];
  const total = Number(first?.total_count ?? 0);
  const totals: Record<string, number> = {
    amount_paid: Number(first?.sum_amount_paid ?? 0),
    vendor_got: Number(first?.sum_vendor_got ?? 0),
    rider_got: Number(first?.sum_rider_got ?? 0),
    cydex_from_customer: Number(first?.sum_cydex_from_customer ?? 0),
    cydex_from_vendor: Number(first?.sum_cydex_from_vendor ?? 0),
    cydex_from_rider: Number(first?.sum_cydex_from_rider ?? 0),
    cydex_total: Number(first?.sum_cydex_total ?? 0),
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchPage(from, to, type, 100000, 0);
      const head = ['Order', 'Type', 'Delivered', 'Paid by', 'Payer', 'Vendor', 'Rider', ...COLUMNS.map((c) => c.label)];
      const lines = all.map((r) => [
        r.order_number, r.order_type === 'rider_request' ? 'Rider request' : 'Customer order',
        format(new Date(r.delivered_at), 'yyyy-MM-dd HH:mm'), r.paid_by, r.payer_name ?? '', r.vendor_name ?? '', r.rider_name ?? '',
        ...COLUMNS.map((c) => Number(r[c.key]).toFixed(2)),
      ]);
      const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `cydex-earnings-${PERIOD_LABELS[period.preset].toLowerCase().replace(/\s+/g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not export'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 xs:flex-row">
          <PeriodFilter value={period} onChange={(p) => { setPeriod(p); setPage(1); }} />
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger className="xs:w-44" aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All orders</SelectItem>
              <SelectItem value="customer">Customer orders</SelectItem>
              <SelectItem value="rider_request">Rider requests</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting || total === 0}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Download CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {COLUMNS.map((c) => (
          <Card key={c.key} className={cn(c.key === 'cydex_total' && 'border-primary/50 bg-primary/5')}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="mt-0.5 text-lg font-bold">{nairaWhole(totals[c.key])}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Paid by</th>
                  {COLUMNS.map((c) => <th key={c.key} className="px-3 py-2 text-right font-medium">{c.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && rows.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No delivered orders in this period.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.order_id} className="hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <Link to={`/admin/orders/${r.order_id}`} className="font-medium text-primary hover:underline">#{r.order_number}</Link>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.delivered_at), 'd MMM yyyy, HH:mm')}
                        {r.order_type === 'rider_request' && <Badge variant="outline" className="ml-1.5 px-1 py-0 text-[10px]">Rider request</Badge>}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="max-w-40 truncate">{r.payer_name ?? '–'}</p>
                      <p className="text-xs capitalize text-muted-foreground">{r.paid_by}</p>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className={cn('whitespace-nowrap px-3 py-2 text-right', c.key === 'cydex_total' && 'font-semibold', c.cydex && 'bg-primary/5')}>
                        {formatNaira(Number(r[c.key]))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="border-t-2 bg-muted/50 font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={2}>Total ({total} orders)</td>
                    {COLUMNS.map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-2 text-right">{formatNaira(totals[c.key])}</td>)}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
      <SimplePagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />
    </div>
  );
};

export default EarningsTab;
