import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Loader2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useVehicleTypes, type VehicleType } from '@/hooks/useVehicleTypes';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { formatNaira } from '@/lib/pricing';

type Draft = {
  key: string | null; name: string; customer_label: string; rate_per_km: string; avg_speed_kmh: string; max_distance_km: string;
  needs_details: boolean; needs_registration: boolean; is_active: boolean;
};

const blank: Draft = {
  key: null, name: '', customer_label: '', rate_per_km: '200', avg_speed_kmh: '15', max_distance_km: '5',
  needs_details: true, needs_registration: false, is_active: true,
};
const toDraft = (t: VehicleType): Draft => ({
  key: t.key, name: t.name, customer_label: t.customer_label ?? '', rate_per_km: String(t.rate_per_km),
  avg_speed_kmh: String(t.avg_speed_kmh), max_distance_km: String(Number(t.max_distance_km)), needs_details: t.needs_details, needs_registration: t.needs_registration,
  is_active: t.is_active,
});

// Admin: the vehicle types riders can register (each with its own price per
// km), and how long an idle rider stays online
const AdminVehicles = () => {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { types, loading } = useVehicleTypes(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [idle, setIdle] = useState('');
  const [savingIdle, setSavingIdle] = useState(false);

  const { data: idleMinutes } = useQuery({
    queryKey: ['rider-idle-minutes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rider_idle_minutes');
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
  useEffect(() => { if (idleMinutes !== undefined) setIdle(String(idleMinutes)); }, [idleMinutes]);

  const { data: baseCharge } = useQuery({
    queryKey: ['delivery-base-charge'],
    queryFn: async () => {
      const { data } = await supabase.from('pricing_config').select('base_rate').order('created_at', { ascending: false }).limit(1).maybeSingle();
      return Number(data?.base_rate ?? 500);
    },
  });

  const rate = Number(draft?.rate_per_km);
  const speed = Number(draft?.avg_speed_kmh);
  const reach = Number(draft?.max_distance_km);
  const valid = !!draft && draft.name.trim().length > 1 && Number.isFinite(rate) && rate >= 0 && Number.isFinite(speed) && speed > 0
    && Number.isFinite(reach) && reach > 0 && reach <= 100;

  const save = async () => {
    if (!draft || !valid) return;
    if (!(await confirm({
      title: draft.key ? `Are you sure you want to change ${draft.name}?` : `Are you sure you want to add ${draft.name.trim()}?`,
      description: 'New orders use the new price and distance straight away. Orders already placed keep their prices. The longest trip also decides how far away customers can see vendors.',
      confirmLabel: 'Yes, save',
    }))) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_save_vehicle_type', {
      p_key: draft.key ?? undefined,
      p_name: draft.name.trim(),
      p_customer_label: draft.customer_label.trim() || undefined,
      p_rate_per_km: rate,
      p_avg_speed_kmh: speed,
      p_max_distance_km: reach,
      p_needs_details: draft.needs_details,
      p_needs_registration: draft.needs_details && draft.needs_registration,
      p_is_active: draft.is_active,
    });
    setSaving(false);
    if (error) return toast.error(errorMessage(error, 'Could not save'));
    toast.success('Vehicle type saved');
    setDraft(null);
    queryClient.invalidateQueries({ queryKey: ['vehicle-types'] });
  };

  const saveIdle = async () => {
    const minutes = Number(idle);
    if (!(await confirm({
      title: minutes > 0
        ? `Are you sure you want to set idle riders offline after ${minutes} minutes?`
        : 'Are you sure you want to switch off the idle rule?',
      description: minutes > 0
        ? 'A rider showing as available who hasn’t taken an order in that time goes offline until they open the app again.'
        : 'Riders will stay online for as long as their app is open.',
      confirmLabel: 'Yes, save',
    }))) return;
    setSavingIdle(true);
    const { error } = await supabase.rpc('admin_set_rider_idle_minutes', { p_minutes: minutes });
    setSavingIdle(false);
    if (error) return toast.error(errorMessage(error, 'Could not save'));
    toast.success('Saved');
    queryClient.invalidateQueries({ queryKey: ['rider-idle-minutes'] });
  };

  const idleOk = idle !== '' && Number.isInteger(Number(idle)) && Number(idle) >= 0 && Number(idle) <= 1440;

  return (
    <AdminPage
      title="Riders & vehicles"
      icon={Bike}
      description="The ways riders deliver, what each costs per km, and when idle riders go offline."
      actions={<Button onClick={() => setDraft(blank)}><Plus className="mr-1.5 h-4 w-4" /> Add vehicle type</Button>}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Vehicle types</CardTitle>
          <CardDescription>
            Delivery fee = distance × the type's price per km + the {formatNaira(baseCharge ?? 500)} delivery charge (
            <Link to="/admin/pricing" className="text-primary hover:underline">change it in Pricing</Link>). Customers
            pick one as their preferred delivery mode, as long as it goes far enough for their trip. Customers see
            vendors as far away as the longest trip of any active type.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded bg-muted" />)}</div>
          ) : (
            <ul className="divide-y">
              {types.map((t) => (
                <li key={t.key} className="flex items-center gap-3 p-3 sm:px-4">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {t.name}
                      {t.customer_label && <Badge variant="secondary">Customers see “{t.customer_label}”</Badge>}
                      {!t.is_active && <Badge variant="outline">Off</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatNaira(Number(t.rate_per_km))} per km · trips up to {Number(t.max_distance_km)} km · about{' '}
                      {Number(t.avg_speed_kmh)} km/h ·{' '}
                      {!t.needs_details ? 'No vehicle details needed'
                        : t.needs_registration ? 'Colour, photo, registration number and document'
                          : 'Colour and photo'}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(t))}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Idle riders</CardTitle>
          <CardDescription>
            A rider showing as available who hasn't taken an order within this time is set offline until they open the
            app again. Enter 0 to switch this off.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="idle-minutes">Minutes</Label>
            <Input id="idle-minutes" type="number" min={0} max={1440} className="w-32" value={idle} onChange={(e) => setIdle(e.target.value)} />
          </div>
          <Button onClick={saveIdle} disabled={savingIdle || !idleOk || Number(idle) === idleMinutes}>
            {savingIdle && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </CardContent>
      </Card>

      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft?.key ? `Edit ${draft.name}` : 'Add a vehicle type'}</DialogTitle>
            <DialogDescription>Riders choose from the active types when they register.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="vt-name">Name</Label>
                <Input id="vt-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Electric bike" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vt-label">Name customers see (optional)</Label>
                <Input id="vt-label" value={draft.customer_label} onChange={(e) => setDraft({ ...draft, customer_label: e.target.value })} placeholder="e.g. Cydex Dashers" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vt-rate">Price per km (₦)</Label>
                  <Input id="vt-rate" type="number" min={0} step="any" value={draft.rate_per_km} onChange={(e) => setDraft({ ...draft, rate_per_km: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vt-speed">Average speed (km/h)</Label>
                  <Input id="vt-speed" type="number" min={1} step="any" value={draft.avg_speed_kmh} onChange={(e) => setDraft({ ...draft, avg_speed_kmh: e.target.value })} />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                The speed is only used for delivery time estimates until this type has 5 real deliveries.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="vt-reach">Longest trip, pickup to drop-off (km)</Label>
                <Input id="vt-reach" type="number" min={0.1} max={100} step="any" value={draft.max_distance_km} onChange={(e) => setDraft({ ...draft, max_distance_km: e.target.value })} />
                <p className="text-xs text-muted-foreground">
                  Riders with this vehicle only see deliveries up to this distance, and customers can only pick it for
                  trips this short. The rider still has to be within 5 km of the pickup.
                </p>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Riders give the vehicle's colour and a photo</span>
                <Switch checked={draft.needs_details} onCheckedChange={(v) => setDraft({ ...draft, needs_details: v })} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>…and its registration number and document</span>
                <Switch
                  checked={draft.needs_details && draft.needs_registration}
                  disabled={!draft.needs_details}
                  onCheckedChange={(v) => setDraft({ ...draft, needs_registration: v })}
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Active (riders can choose it, customers can pick it)</span>
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

export default AdminVehicles;
