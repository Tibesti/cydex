import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { formatNaira } from '@/lib/pricing';

// Rates are stored as fractions (0.15); the form shows percentages (15)
const FIELDS = [
  { key: 'base_rate', label: 'Minimum delivery fare', unit: '₦', hint: 'The delivery fee is never below this.', min: 0, max: 100000 },
  { key: 'distance_rate_per_km', label: 'Price per km', unit: '₦', hint: 'Delivery fee = km × this, if that’s above the minimum.', min: 0, max: 100000 },
  { key: 'service_charge_rate', label: 'Service Charge', unit: '%', hint: 'Added to the customer’s item total. Cydex keeps it.', min: 0, max: 50 },
  { key: 'vendor_commission_rate', label: 'Vendor commission', unit: '%', hint: 'Taken from the vendor’s item total.', min: 0, max: 50 },
  { key: 'rider_share_rate', label: 'Rider share of delivery fee', unit: '%', hint: 'Cydex keeps the rest of the delivery fee.', min: 50, max: 100 },
  { key: 'rider_request_commission_rate', label: 'Rider request commission', unit: '%', hint: 'Added to the delivery fee when a vendor requests a rider.', min: 0, max: 50 },
] as const;
type Key = (typeof FIELDS)[number]['key'];
type PricingRow = Record<Key, number | null> & { id: string; created_at: string; created_by: string | null; note: string | null };

const toForm = (row: PricingRow) =>
  Object.fromEntries(FIELDS.map((f) => [f.key, row[f.key] == null ? '' : String(f.unit === '%' ? +(Number(row[f.key]) * 100).toFixed(2) : Number(row[f.key]))])) as Record<Key, string>;
const show = (key: Key, v: number | null) => {
  const f = FIELDS.find((x) => x.key === key)!;
  return v == null ? '–' : f.unit === '%' ? `${+(Number(v) * 100).toFixed(2)}%` : formatNaira(Number(v));
};

// Admin: delivery and commission prices. Each save adds a new version; new
// orders use the newest, existing orders keep the prices they were charged.
const AdminPricing = () => {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [form, setForm] = useState<Record<Key, string> | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: history = [] } = useQuery({
    queryKey: ['admin-pricing'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pricing_config').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      const rows = (data ?? []) as unknown as PricingRow[];
      const ids = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
      const { data: people } = ids.length ? await supabase.from('profiles').select('id, name').in('id', ids) : { data: [] };
      const names = new Map((people ?? []).map((p) => [p.id, p.name]));
      return rows.map((r) => ({ ...r, created_by_name: r.created_by ? names.get(r.created_by) ?? 'Admin' : null }));
    },
  });
  const current = history[0];
  useEffect(() => { if (current && !form) setForm(toForm(current)); }, [current, form]);

  const values = useMemo(() => {
    if (!form) return null;
    const out = {} as Record<Key, number>;
    for (const f of FIELDS) {
      const n = Number(form[f.key]);
      if (form[f.key] === '' || Number.isNaN(n) || n < f.min || n > f.max) return null;
      out[f.key] = f.unit === '%' ? n / 100 : n;
    }
    return out;
  }, [form]);
  const changed = !!values && !!current && FIELDS.some((f) => Math.abs(values[f.key] - Number(current[f.key] ?? 0)) > 1e-9);

  // Worked example with the new prices: ₦5,000 of items, 4 km away
  const example = values && (() => {
    const delivery = Math.max(values.base_rate, 4 * values.distance_rate_per_km);
    const service = 5000 * values.service_charge_rate;
    const commission = 5000 * values.vendor_commission_rate;
    const riderGets = delivery * values.rider_share_rate;
    return { delivery, service, total: 5000 + delivery + service, vendorGets: 5000 - commission, riderGets, cydex: service + commission + delivery - riderGets };
  })();

  const save = async () => {
    if (!values) return;
    if (!(await confirm({
      title: 'Are you sure you want to change the prices?',
      description: 'Every new order and rider request uses them straight away. Orders already placed keep their prices.',
      confirmLabel: 'Yes, save new prices',
    }))) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_update_pricing', {
      p_base_rate: values.base_rate, p_distance_rate_per_km: values.distance_rate_per_km,
      p_service_charge_rate: values.service_charge_rate, p_vendor_commission_rate: values.vendor_commission_rate,
      p_rider_share_rate: values.rider_share_rate, p_rider_request_commission_rate: values.rider_request_commission_rate,
      p_note: note.trim() || undefined,
    });
    setSaving(false);
    if (error) return toast.error(errorMessage(error, 'Could not save the prices'));
    toast.success('Prices updated. New orders use them from now.');
    setNote('');
    setForm(null);
    queryClient.invalidateQueries({ queryKey: ['admin-pricing'] });
  };

  return (
    <AdminPage title="Pricing" icon={SlidersHorizontal} description="Delivery fees, Service Charge and commissions. Orders already placed keep the prices they were charged.">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Current prices</CardTitle>
            {current && <CardDescription>Last changed {format(new Date(current.created_at), 'd MMM yyyy, HH:mm')}{current.created_by_name ? ` by ${current.created_by_name}` : ''}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {!form ? <div className="h-64 animate-pulse rounded bg-muted" /> : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {FIELDS.map((f) => {
                    const n = Number(form[f.key]);
                    const bad = form[f.key] === '' || Number.isNaN(n) || n < f.min || n > f.max;
                    return (
                      <div key={f.key} className="space-y-1.5">
                        <Label htmlFor={f.key}>{f.label}</Label>
                        <div className="relative">
                          {f.unit === '₦' && <span className="absolute left-3 top-2 text-sm text-muted-foreground">₦</span>}
                          <Input id={f.key} type="number" inputMode="decimal" min={f.min} max={f.max} step="any"
                            className={f.unit === '₦' ? 'pl-7' : 'pr-8'} value={form[f.key]}
                            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                          {f.unit === '%' && <span className="absolute right-3 top-2 text-sm text-muted-foreground">%</span>}
                        </div>
                        <p className={bad ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                          {bad ? `Between ${f.unit === '₦' ? '₦' : ''}${f.min}${f.unit === '%' ? '%' : ''} and ${f.unit === '₦' ? '₦' : ''}${f.max.toLocaleString()}${f.unit === '%' ? '%' : ''}` : f.hint}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pricing-note">Note (optional)</Label>
                  <Textarea id="pricing-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why the change, e.g. fuel price increase" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={save} disabled={!changed || saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save new prices
                  </Button>
                  {changed && <Button variant="ghost" onClick={() => current && setForm(toForm(current))}>Undo changes</Button>}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Example</CardTitle>
            <CardDescription>₦5,000 of items delivered 4 km away{changed ? ', with your changes' : ''}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {example ? (
              <>
                {[
                  ['Delivery fee', example.delivery],
                  ['Service Charge', example.service],
                  ['Customer pays', example.total],
                  ['Vendor gets', example.vendorGets],
                  ['Rider gets', example.riderGets],
                  ['Cydex keeps', example.cydex],
                ].map(([label, v], i) => (
                  <div key={label as string} className={`flex justify-between ${i === 2 || i === 5 ? 'border-t pt-1 font-semibold' : ''}`}>
                    <span>{label}</span><span>{formatNaira(v as number)}</span>
                  </div>
                ))}
              </>
            ) : <p className="text-muted-foreground">Fix the highlighted values to see the example.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">From</th>
                  {FIELDS.map((f) => <th key={f.key} className="px-3 py-2 text-right font-medium">{f.label}</th>)}
                  <th className="px-3 py-2 font-medium">Changed by</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((r, i) => (
                  <tr key={r.id} className={i === 0 ? 'bg-primary/5' : undefined}>
                    <td className="whitespace-nowrap px-3 py-2">{format(new Date(r.created_at), 'd MMM yyyy, HH:mm')}{i === 0 && <span className="ml-1 text-xs text-primary">(current)</span>}</td>
                    {FIELDS.map((f) => <td key={f.key} className="whitespace-nowrap px-3 py-2 text-right">{show(f.key, r[f.key])}</td>)}
                    <td className="px-3 py-2">
                      <p>{r.created_by_name ?? 'Setup'}</p>
                      {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </AdminPage>
  );
};

export default AdminPricing;
