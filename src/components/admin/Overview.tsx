import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle, ArrowRightLeft, Banknote, Bell, Bike, CheckCircle2, ChevronRight, Clock, Landmark, Mail, Package,
  ShieldCheck, Store, Truck, Wallet,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { supabase } from '@/integrations/supabase/client';
import { nairaWhole, periodRange, PERIOD_LABELS, type Period } from '@/lib/adminPeriod';
import { orderStatusLabel } from '@/lib/orderStatus';
import PeriodFilter from './PeriodFilter';

interface DashboardStats {
  from: string;
  to: string;
  bucket: 'day' | 'month';
  transactions: { count: number; amount: number; refunded_count: number; refunded_amount: number; rider_requests: number };
  delivered_orders: number;
  revenue: {
    from_customers: number; from_vendors: number; from_riders: number; from_withdrawals: number;
    withdrawals_paid: number; total: number;
    paid_to_vendors: number; paid_to_riders: number;
  };
  orders_today: number;
  active_deliveries: number;
  awaiting_rider: number;
  online_riders: number;
  pending_verifications: number;
  pending_payouts: { count: number; amount: number };
  held_funds: number;
  failed_emails: number;
  series: { period: string; transactions: number; orders: number; revenue: number }[] | null;
}

const chartConfig = {
  transactions: { label: 'Transactions', color: 'hsl(var(--muted-foreground))' },
  revenue: { label: 'Cydex revenue', color: '#6CE000' },
  orders: { label: 'Paid orders', color: '#6CE000' },
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const Stat = ({
  label, value, hint, icon: Icon, to, highlight,
}: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: React.ElementType; to?: string; highlight?: boolean }) => {
  const body = (
    <Card className={highlight ? 'border-primary/50' : undefined}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-bold sm:text-2xl">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      </CardContent>
    </Card>
  );
  return to ? <Link to={to} className="block rounded-lg transition-opacity hover:opacity-80">{body}</Link> : body;
};

// Admin home: money for the chosen period, what's happening now, and orders that look stuck
const Overview = () => {
  const [period, setPeriod] = useState<Period>({ preset: 'this_month' });
  const [chart, setChart] = useState<'money' | 'orders'>('money');
  const range = periodRange(period);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-dashboard', range.from, range.to],
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_dashboard_stats', {
        p_from: range.from ?? undefined,
        p_to: range.to ?? undefined,
      });
      if (error) throw error;
      return data as unknown as DashboardStats;
    },
  });

  const { data: attention = [] } = useQuery({
    queryKey: ['admin-attention'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_orders_needing_attention');
      if (error) throw error;
      return data ?? [];
    },
  });

  const s = stats;
  const revenue = Number(s?.revenue.total ?? 0);
  const share = (part: number) => (revenue > 0 ? Math.round((part / revenue) * 100) : 0);
  const series = (s?.series ?? []).map((p) => ({
    label: format(new Date(p.period), s?.bucket === 'month' ? 'MMM yy' : 'd MMM'),
    transactions: Number(p.transactions),
    revenue: Number(p.revenue),
    orders: Number(p.orders),
  }));

  // Things waiting on an admin
  const todo = s ? [
    s.pending_verifications > 0 && {
      icon: ShieldCheck, to: '/admin/verifications',
      text: `You have ${plural(s.pending_verifications, 'verification')} to review`,
    },
    s.pending_payouts.count > 0 && {
      icon: Landmark, to: '/admin/payments?tab=payouts',
      text: `You have ${plural(s.pending_payouts.count, 'withdrawal request')} waiting for approval (${nairaWhole(s.pending_payouts.amount)})`,
    },
    attention.length > 0 && {
      icon: AlertTriangle, to: '#attention',
      text: `${plural(attention.length, 'order')} ${attention.length === 1 ? 'needs' : 'need'} attention`,
    },
    s.awaiting_rider > 0 && {
      icon: Clock, to: '/admin/orders?status=ready_for_pickup',
      text: `${plural(s.awaiting_rider, 'order')} waiting for a rider`,
    },
    s.failed_emails > 0 && {
      icon: Mail, to: '/admin/emails',
      text: `${plural(s.failed_emails, 'email')} failed to send`,
    },
  ].filter(Boolean) as { icon: React.ElementType; to: string; text: string }[] : [];
  const dash = isLoading ? '…' : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {PERIOD_LABELS[period.preset]}
            {s && period.preset !== 'all' && ` · ${format(new Date(s.from), 'd MMM yyyy')} – ${format(new Date(s.to), 'd MMM yyyy')}`}
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {s && (
        <Card className={todo.length ? 'border-amber-500/40 bg-amber-500/5' : undefined}>
          <CardContent className="p-0">
            {todo.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" /> You're all caught up. Nothing is waiting on an admin.
              </p>
            ) : (
              <ul className="divide-y divide-amber-500/20">
                <li className="flex items-center gap-2 px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Bell className="h-3.5 w-3.5" /> To do
                </li>
                {todo.map((t) => {
                  const inner = (
                    <>
                      <t.icon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span className="flex-1 text-sm font-medium">{t.text}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </>
                  );
                  return (
                    <li key={t.text}>
                      {t.to.startsWith('#') ? (
                        <a href={t.to} className="flex items-center gap-3 px-4 py-3 hover:bg-amber-500/10">{inner}</a>
                      ) : (
                        <Link to={t.to} className="flex items-center gap-3 px-4 py-3 hover:bg-amber-500/10">{inner}</Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Money for the period */}
      <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total transactions"
          icon={ArrowRightLeft}
          value={dash ?? nairaWhole(s?.transactions.amount)}
          hint={s && `${s.transactions.count} payments${s.transactions.refunded_count ? ` · ${nairaWhole(s.transactions.refunded_amount)} refunded` : ''}`}
        />
        <Stat
          label="Total revenue (Cydex)"
          icon={Banknote}
          highlight
          value={dash ?? nairaWhole(revenue)}
          hint={s && `From ${s.delivered_orders} delivered orders${s.revenue.withdrawals_paid ? ` and ${s.revenue.withdrawals_paid} withdrawals` : ''}`}
          to="/admin/payments?tab=earnings"
        />
        <Stat label="Paid to vendors" icon={Store} value={dash ?? nairaWhole(s?.revenue.paid_to_vendors)} />
        <Stat label="Paid to riders" icon={Bike} value={dash ?? nairaWhole(s?.revenue.paid_to_riders)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-base">{chart === 'money' ? 'Transactions and revenue' : 'Paid orders'}</CardTitle>
              <CardDescription>{s?.bucket === 'month' ? 'Per month' : 'Per day'}</CardDescription>
            </div>
            <div className="flex rounded-md border p-0.5">
              {(['money', 'orders'] as const).map((c) => (
                <Button key={c} size="sm" variant={chart === c ? 'secondary' : 'ghost'} className="h-7 px-2.5 capitalize" onClick={() => setChart(c)}>
                  {c}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {series.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <ChartContainer config={chartConfig} className="h-64 w-full sm:h-72">
                <BarChart data={series} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} minTickGap={16} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={chart === 'money' ? 56 : 32} allowDecimals={false}
                    tickFormatter={(v: number) => (chart === 'orders' ? String(v) : v >= 1000 ? `₦${Math.round(v / 1000)}k` : `₦${v}`)} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => (
                    <span className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig]?.label}</span>
                      <span className="font-medium">{name === 'orders' ? String(v) : nairaWhole(Number(v))}</span>
                    </span>
                  )} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {chart === 'money' ? (
                    <>
                      <Bar dataKey="transactions" fill="var(--color-transactions)" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} />
                    </>
                  ) : (
                    <Bar dataKey="orders" fill="var(--color-orders)" radius={[3, 3, 0, 0]} />
                  )}
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Where revenue came from</CardTitle>
            <CardDescription>Cydex's cut on delivered orders, plus withdrawal fees</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'From customers', hint: 'Service Charge', value: Number(s?.revenue.from_customers ?? 0) },
              { label: 'From vendors', hint: 'Commission on items and rider requests', value: Number(s?.revenue.from_vendors ?? 0) },
              { label: 'From riders', hint: 'Cydex share of delivery fees', value: Number(s?.revenue.from_riders ?? 0) },
              {
                label: 'From withdrawal fees',
                hint: `1.5% on ${s?.revenue.withdrawals_paid ?? 0} paid withdrawal${s?.revenue.withdrawals_paid === 1 ? '' : 's'}, before Squad's transfer charge`,
                value: Number(s?.revenue.from_withdrawals ?? 0),
              },
            ].map((r) => (
              <div key={r.label} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{r.label}</span>
                  <span className="font-semibold">{nairaWhole(r.value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${share(r.value)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{r.hint} · {share(r.value)}%</p>
              </div>
            ))}
            <div className="flex items-baseline justify-between border-t pt-3 text-sm">
              <span className="font-semibold">Total</span>
              <span className="text-lg font-bold">{nairaWhole(revenue)}</span>
            </div>
            {!!s?.transactions.rider_requests && (
              <p className="text-xs text-muted-foreground">Includes {s.transactions.rider_requests} rider requests.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right now */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Right now</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Orders today" icon={Package} value={dash ?? s?.orders_today} to="/admin/orders" />
          <Stat label="Active deliveries" icon={Truck} value={dash ?? s?.active_deliveries} to="/admin/orders?status=out_for_delivery" />
          <Stat label="Waiting for a rider" icon={Clock} value={dash ?? s?.awaiting_rider} to="/admin/orders?status=ready_for_pickup"
            highlight={!!s?.awaiting_rider} />
          <Stat label="Riders online" icon={Bike} value={dash ?? s?.online_riders} />
          <Stat label="Verifications to review" icon={ShieldCheck} value={dash ?? s?.pending_verifications} to="/admin/verifications"
            highlight={!!s?.pending_verifications} />
          <Stat label="Withdrawals to approve" icon={Landmark} value={dash ?? s?.pending_payouts.count}
            hint={s?.pending_payouts.count ? nairaWhole(s.pending_payouts.amount) : undefined}
            to="/admin/payments?tab=payouts" highlight={!!s?.pending_payouts.count} />
          <Stat label="Held for active orders" icon={Wallet} value={dash ?? nairaWhole(s?.held_funds)} to="/admin/payments?tab=held" />
          <Stat label="Failed emails" icon={Mail} value={dash ?? s?.failed_emails} to="/admin/emails" highlight={!!s?.failed_emails} />
        </div>
      </div>

      <Card id="attention" className="scroll-mt-20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Orders needing attention
            {attention.length > 0 && <Badge variant="destructive">{attention.length}</Badge>}
          </CardTitle>
          <CardDescription>Paid orders that have been stuck longer than usual, and locked handover codes.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {attention.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing stuck right now.</p>
          ) : (
            <ul className="divide-y">
              {attention.map((a) => (
                <li key={`${a.order_id}-${a.reason}`}>
                  <Link to={`/admin/orders/${a.order_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        #{a.order_number}
                        <span className="text-amber-600 dark:text-amber-400">{a.reason}</span>
                        {a.order_type === 'rider_request' && <Badge variant="outline">Rider request</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {orderStatusLabel(a.status)} · {a.vendor_name ?? 'Vendor'}{a.rider_name ? ` · ${a.rider_name}` : ''} ·{' '}
                        {formatDistanceToNow(new Date(a.since), { addSuffix: true })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Overview;
