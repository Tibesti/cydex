import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { EyeOff, Loader2, Pencil, Plus, TicketPercent } from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useVehicleTypes } from '@/hooks/useVehicleTypes';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { formatNaira } from '@/lib/pricing';
import { AUDIENCES, TARGETS, describePromotion, type PromoAudience, type PromoTarget } from '@/lib/promotions';
import { cn } from '@/lib/utils';

type Promo = {
  id: string; name: string; code: string | null; discount_type: string; discount_value: number; applies_to: string;
  vendor_id: string | null; vendor_name: string | null; cost_bearer: string; max_distance_km: number | null;
  vehicle_types: string[] | null; starts_at: string; ends_at: string; is_active: boolean; state: string;
  uses: number; total_discount: number;
  audience: string; max_users: number | null; max_uses_per_user: number | null; users: number;
  show_in_offers: boolean;
};

type Draft = {
  id: string | null; name: string; code: string; discount_type: 'percent' | 'flat'; discount_value: string;
  audience: PromoAudience; applies_to: PromoTarget; vendor_id: string; vendor_name: string; cost_bearer: 'cydex' | 'vendor';
  max_distance_km: string; vehicle_types: string[]; starts_at: string; ends_at: string; is_active: boolean;
  // '' = no limit
  max_users: string; max_uses_per_user: string;
  // Listed under "Offers for you" (home pages and the codes offered at checkout)
  show_in_offers: boolean;
};

const STATES: Record<string, { label: string; className: string }> = {
  running: { label: 'Running', className: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' },
  ended: { label: 'Ended', className: 'bg-muted text-muted-foreground' },
  off: { label: 'Switched off', className: 'bg-muted text-muted-foreground' },
  claimed: { label: 'Fully claimed', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
};

// datetime-local value (local time) <-> ISO
const toLocal = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
const blank = (): Draft => ({
  id: null, name: '', code: '', discount_type: 'percent', discount_value: '', audience: 'customer', applies_to: 'delivery_fee',
  vendor_id: '', vendor_name: '', cost_bearer: 'cydex', max_distance_km: '', vehicle_types: [], max_users: '', max_uses_per_user: '', show_in_offers: true,
  starts_at: toLocal(new Date().toISOString()), ends_at: toLocal(new Date(Date.now() + 7 * 86400e3).toISOString()), is_active: true,
});

const describe = (p: Pick<Promo, 'discount_type' | 'discount_value' | 'applies_to' | 'vendor_name' | 'audience'>) =>
  describePromotion(p, p.audience === 'all' ? 'customer' : (p.audience as PromoAudience));

// '' -> null (no limit); otherwise a whole number of at least 1, or NaN
const limit = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : Number.isInteger(Number(v)) && Number(v) >= 1 ? Number(v) : NaN);

// Admin: promotions and discounts, for customers, vendors, riders or everyone,
// optionally limited to the first N people and N uses each. One discount
// applies to what someone pays per order: the coupon they entered, otherwise
// the automatic one that saves them the most.
const AdminPromotions = () => {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { types, labelOf } = useVehicleTypes(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorQuery, setVendorQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setVendorQuery(vendorSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [vendorSearch]);

  const { data: promos = [], isLoading } = useQuery({
    queryKey: ['admin-promotions'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_promotions');
      if (error) throw error;
      return (data ?? []) as Promo[];
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['admin-promo-vendors', vendorQuery],
    enabled: !!draft && draft.applies_to === 'items',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_users', { p_search: vendorQuery || undefined, p_role: 'vendor', p_limit: 8, p_offset: 0 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const value = Number(draft?.discount_value);
  const km = draft?.max_distance_km === '' ? null : Number(draft?.max_distance_km);
  const valid = !!draft && draft.name.trim().length > 1 && value > 0 && (draft.discount_type === 'flat' || value <= 100)
    && (draft.applies_to !== 'items' || !!draft.vendor_id)
    && !!draft.starts_at && !!draft.ends_at && new Date(draft.ends_at) > new Date(draft.starts_at)
    && (km === null || km > 0)
    && !Number.isNaN(limit(draft.max_users)) && !Number.isNaN(limit(draft.max_uses_per_user));
  const commission = draft?.applies_to === 'commission';

  // Changing who it's for keeps the target if that audience has it
  const setAudience = (audience: PromoAudience) => draft && setDraft({
    ...draft,
    audience,
    applies_to: (draft.applies_to in TARGETS[audience] ? draft.applies_to : Object.keys(TARGETS[audience])[0]) as PromoTarget,
  });

  const save = async () => {
    if (!draft || !valid) return;
    const summary = describe({ discount_type: draft.discount_type, discount_value: value, applies_to: draft.applies_to, vendor_name: draft.vendor_name, audience: draft.audience });
    const people = limit(draft.max_users);
    const each = limit(draft.max_uses_per_user);
    const limits = [
      people ? `the first ${people} ${people === 1 ? 'person' : 'people'}` : null,
      each ? `${each} use${each === 1 ? '' : 's'} each` : null,
    ].filter(Boolean).join(', ');
    if (!(await confirm({
      title: draft.id ? `Are you sure you want to save “${draft.name.trim()}”?` : `Are you sure you want to create “${draft.name.trim()}”?`,
      description: `For ${AUDIENCES[draft.audience].toLowerCase()}: ${summary}, ${
        draft.code.trim() && !commission ? `with coupon code ${draft.code.trim().toUpperCase()}` : 'applied automatically'
      }${limits ? `, for ${limits}` : ''}. ${
        draft.applies_to === 'items' && draft.cost_bearer === 'vendor' ? 'The business pays for it.' : 'Cydex pays for it.'
      } It takes effect from its start date.${
        draft.show_in_offers ? '' : draft.code.trim() && !commission
          ? ' The code won’t be listed anywhere: only people you give it to can use it.'
          : ' It won’t be listed under Offers for you.'}`,
      confirmLabel: 'Yes, save',
    }))) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_save_promotion', {
      // Left-out fields mean "none" (every optional field has a default in the database)
      p_id: draft.id ?? undefined,
      p_name: draft.name.trim(),
      p_audience: draft.audience,
      p_code: commission ? undefined : draft.code.trim() || undefined,
      p_discount_type: draft.discount_type,
      p_discount_value: value,
      p_applies_to: draft.applies_to,
      p_vendor_id: draft.applies_to === 'items' ? draft.vendor_id || undefined : undefined,
      p_cost_bearer: draft.applies_to === 'items' ? draft.cost_bearer : 'cydex',
      p_max_distance_km: km ?? undefined,
      p_vehicle_types: draft.vehicle_types.length ? draft.vehicle_types : undefined,
      p_max_users: people ?? undefined,
      p_max_uses_per_user: each ?? undefined,
      p_starts_at: new Date(draft.starts_at).toISOString(),
      p_ends_at: new Date(draft.ends_at).toISOString(),
      p_is_active: draft.is_active,
      p_show_in_offers: draft.show_in_offers,
    });
    setSaving(false);
    if (error) return toast.error(errorMessage(error, 'Could not save the promotion'));
    toast.success('Promotion saved');
    setDraft(null);
    queryClient.invalidateQueries({ queryKey: ['admin-promotions'] });
  };

  const edit = (p: Promo) => {
    setVendorSearch('');
    setDraft({
      id: p.id, name: p.name, code: p.code ?? '', discount_type: p.discount_type as Draft['discount_type'],
      discount_value: String(p.discount_value), audience: (p.audience ?? 'customer') as PromoAudience,
      applies_to: p.applies_to as Draft['applies_to'], vendor_id: p.vendor_id ?? '',
      max_users: p.max_users == null ? '' : String(p.max_users),
      max_uses_per_user: p.max_uses_per_user == null ? '' : String(p.max_uses_per_user),
      show_in_offers: p.show_in_offers ?? true,
      vendor_name: p.vendor_name ?? '', cost_bearer: p.cost_bearer as Draft['cost_bearer'],
      max_distance_km: p.max_distance_km == null ? '' : String(p.max_distance_km), vehicle_types: p.vehicle_types ?? [],
      starts_at: toLocal(p.starts_at), ends_at: toLocal(p.ends_at), is_active: p.is_active,
    });
  };

  return (
    <AdminPage
      title="Promotions"
      icon={TicketPercent}
      description="Discounts for customers, vendors and riders, with optional limits on how many people and how many times each."
      actions={<Button onClick={() => { setVendorSearch(''); setDraft(blank()); }}><Plus className="mr-1.5 h-4 w-4" /> New promotion</Button>}
    >
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-muted" />)}</div>
          ) : promos.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No promotions yet.</p>
          ) : (
            <ul className="divide-y">
              {promos.map((p) => (
                <li key={p.id} className="flex items-start gap-3 p-3 sm:px-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {p.name}
                      <Badge variant="outline" className={cn('border-transparent', STATES[p.state]?.className)}>{STATES[p.state]?.label ?? p.state}</Badge>
                      <Badge variant="outline">{AUDIENCES[p.audience as PromoAudience] ?? p.audience}</Badge>
                      {p.code ? <Badge variant="secondary" className="font-mono">{p.code}</Badge> : <Badge variant="outline">Automatic</Badge>}
                      {!p.show_in_offers && <Badge variant="outline" className="gap-1"><EyeOff className="h-3 w-3" /> Not in offers</Badge>}
                    </p>
                    <p className="text-sm">{describe(p)}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(p.starts_at), 'd MMM yyyy, HH:mm')} – {format(new Date(p.ends_at), 'd MMM yyyy, HH:mm')}
                      {p.max_distance_km != null && ` · up to ${Number(p.max_distance_km)} km`}
                      {p.vehicle_types?.length ? ` · ${p.vehicle_types.map(labelOf).join(', ')}` : ''}
                      {p.applies_to === 'items' && ` · paid by ${p.cost_bearer === 'vendor' ? 'the business' : 'Cydex'}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Used {Number(p.uses)} time{Number(p.uses) === 1 ? '' : 's'} by {Number(p.users)}
                      {p.max_users != null ? ` of the first ${p.max_users}` : ''} {Number(p.users) === 1 && p.max_users == null ? 'person' : 'people'}
                      {p.max_uses_per_user != null ? ` · ${p.max_uses_per_user} use${p.max_uses_per_user === 1 ? '' : 's'} each` : ''}
                      {' · '}{formatNaira(Number(p.total_discount))} given
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => edit(p)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Edit promotion' : 'New promotion'}</DialogTitle>
            <DialogDescription>Choose who it's for first; that decides what it can take money off.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pr-name">Name</Label>
                <Input id="pr-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Free delivery weekend" />
              </div>

              <div className="space-y-1.5">
                <Label>Who it's for</Label>
                <Select value={draft.audience} onValueChange={(v) => setAudience(v as PromoAudience)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(AUDIENCES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>What it takes money off</Label>
                <Select value={draft.applies_to} onValueChange={(v) => setDraft({ ...draft, applies_to: v as Draft['applies_to'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TARGETS[draft.audience]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                {commission && (
                  <p className="text-xs text-muted-foreground">
                    Cydex takes less commission, so {draft.audience === 'rider' ? 'riders keep' : draft.audience === 'vendor' ? 'vendors keep' : 'vendors and riders keep'} more
                    of each {draft.audience === 'rider' ? 'delivery fee' : draft.audience === 'vendor' ? 'sale' : 'sale or delivery fee'}. It applies by itself.
                  </p>
                )}
              </div>

              {draft.applies_to === 'items' && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pr-vendor">Business</Label>
                    {draft.vendor_id ? (
                      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                        <span className="font-medium">{draft.vendor_name}</span>
                        <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, vendor_id: '', vendor_name: '' })}>Change</Button>
                      </div>
                    ) : (
                      <>
                        <Input id="pr-vendor" value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} placeholder="Search businesses by name" />
                        <ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
                          {vendors.length === 0 ? <li className="p-2 text-sm text-muted-foreground">No businesses found.</li>
                            : vendors.map((v) => (
                              <li key={v.id}>
                                <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                  onClick={() => setDraft({ ...draft, vendor_id: v.id, vendor_name: v.name ?? 'Business' })}>
                                  {v.name} <span className="text-xs text-muted-foreground">{v.email}</span>
                                </button>
                              </li>
                            ))}
                        </ul>
                      </>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Who pays for the discount</Label>
                    <Select value={draft.cost_bearer} onValueChange={(v) => setDraft({ ...draft, cost_bearer: v as Draft['cost_bearer'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cydex">Cydex (the business is paid in full)</SelectItem>
                        <SelectItem value="vendor">The business (it comes off their payout)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Discount</Label>
                  <Select value={draft.discount_type} onValueChange={(v) => setDraft({ ...draft, discount_type: v as Draft['discount_type'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percentage</SelectItem>
                      <SelectItem value="flat">Flat amount (₦)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-value">{draft.discount_type === 'percent' ? 'Percent off' : 'Amount off (₦)'}</Label>
                  <Input id="pr-value" type="number" min={0} step="any" value={draft.discount_value} onChange={(e) => setDraft({ ...draft, discount_value: e.target.value })} />
                </div>
              </div>
              {draft.discount_type === 'percent' && (
                <p className="-mt-2 text-xs text-muted-foreground">
                  100% makes it free.{' '}
                  <button type="button" className="text-primary hover:underline" onClick={() => setDraft({ ...draft, discount_value: '100' })}>Make it free</button>
                </p>
              )}
              {draft.discount_type === 'percent' && value > 100 && <p className="-mt-2 text-xs text-destructive">A percentage can't be more than 100.</p>}

              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Limits (optional)</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="pr-users">Only the first … people</Label>
                    <Input id="pr-users" type="number" min={1} step={1} value={draft.max_users} onChange={(e) => setDraft({ ...draft, max_users: e.target.value })} placeholder="No limit" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pr-each">Uses for each person</Label>
                    <Input id="pr-each" type="number" min={1} step={1} value={draft.max_uses_per_user} onChange={(e) => setDraft({ ...draft, max_uses_per_user: e.target.value })} placeholder="No limit" />
                  </div>
                </div>
                {(Number.isNaN(limit(draft.max_users)) || Number.isNaN(limit(draft.max_uses_per_user))) && (
                  <p className="text-xs text-destructive">Enter whole numbers of 1 or more, or leave them empty for no limit.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  A use is an order that's paid and not cancelled. People see how many uses they have left; once the
                  places are taken, nobody new gets it.
                </p>
              </div>

              {!commission && (
              <div className="space-y-1.5">
                <Label htmlFor="pr-code">Coupon code (optional)</Label>
                <Input id="pr-code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="e.g. WELCOME500" maxLength={20} className="font-mono" />
                <p className="text-xs text-muted-foreground">
                  With a code, people must enter it when they pay. Without one, it's applied automatically.
                </p>
              </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pr-start">Starts</Label>
                  <Input id="pr-start" type="datetime-local" value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pr-end">Ends</Label>
                  <Input id="pr-end" type="datetime-local" value={draft.ends_at} min={draft.starts_at} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })} />
                </div>
              </div>
              {draft.starts_at && draft.ends_at && new Date(draft.ends_at) <= new Date(draft.starts_at) && (
                <p className="-mt-2 text-xs text-destructive">The end must be after the start.</p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="pr-km">Only for deliveries up to (km, optional)</Label>
                <Input id="pr-km" type="number" min={0} step="any" value={draft.max_distance_km} onChange={(e) => setDraft({ ...draft, max_distance_km: e.target.value })} placeholder="Any distance" />
              </div>

              <div className="space-y-2">
                <Label>Only for these delivery modes (optional)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {types.filter((t) => t.is_active || draft.vehicle_types.includes(t.key)).map((t) => (
                    <label key={t.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.vehicle_types.includes(t.key)}
                        onCheckedChange={(c) => setDraft({
                          ...draft,
                          vehicle_types: c ? [...draft.vehicle_types, t.key] : draft.vehicle_types.filter((k) => k !== t.key),
                        })}
                      />
                      {t.customer_label || t.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Leave all unticked for every delivery mode.</p>
              </div>

              <div className="space-y-1">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Show in "Offers for you"</span>
                  <Switch checked={draft.show_in_offers} onCheckedChange={(v) => setDraft({ ...draft, show_in_offers: v })} />
                </label>
                <p className="text-xs text-muted-foreground">
                  {draft.show_in_offers
                    ? draft.code.trim() && !commission
                      ? 'Everyone it\'s for sees the code on their home page and at checkout.'
                      : 'Everyone it\'s for sees it on their home page.'
                    : draft.code.trim() && !commission
                      ? 'The code is hidden. It only works for people you give it to.'
                      : 'It isn\'t listed, but it still applies by itself.'}
                </p>
              </div>

              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Active</span>
                <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
              </label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !valid}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
};

export default AdminPromotions;
