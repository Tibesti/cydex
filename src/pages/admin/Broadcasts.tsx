import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Bell, Loader2, Mail, MapPin, Megaphone, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import { MapLocationPicker } from '@/components/address/AddressPickerDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PagedList from '@/components/ui/paged-list';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { errorMessage } from '@/lib/address';
import type { PickedLocation } from '@/lib/googleMaps';
import { cn } from '@/lib/utils';

type Broadcast = Tables<'broadcasts'>;
type Group = 'customer' | 'vendor' | 'rider';

const GROUPS: Record<Group, string> = { customer: 'Customers', vendor: 'Vendors', rider: 'Riders' };
const STATES: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' },
  sent: { label: 'Sent', className: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
};
const RADII = [2, 5, 10, 20];
const TITLE_MAX = 80;
const BODY_MAX = 2000;

interface Draft {
  title: string;
  body: string;
  push: boolean;
  email: boolean;
  groups: Group[];
  area: 'all' | 'near';
  location: PickedLocation | null;
  radius: string;
  when: 'now' | 'later';
  at: string;
}
const blank = (): Draft => ({
  title: '', body: '', push: true, email: false, groups: ['customer'], area: 'all', location: null, radius: '5',
  when: 'now', at: format(new Date(Date.now() + 3600e3), "yyyy-MM-dd'T'HH:mm"),
});

const groupNames = (groups: string[]) => groups.map((g) => GROUPS[g as Group] ?? g).join(', ');

// Admin: send an announcement to customers, vendors and/or riders, as a
// notification (with push) and/or an email, to everyone or only people near a
// place, now or at a set time (admin_save_broadcast; the send-due-broadcasts
// job sends scheduled ones).
const AdminBroadcasts = () => {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: broadcasts = [], isLoading } = useQuery({
    queryKey: ['admin-broadcasts'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const radius = Number(draft?.radius);
  const near = draft?.area === 'near';
  const areaOk = !near || (!!draft?.location && radius > 0 && radius <= 500);
  const later = draft?.when === 'later';
  const atOk = !later || (!!draft?.at && new Date(draft.at).getTime() > Date.now());
  const valid = !!draft && draft.title.trim().length > 1 && draft.body.trim().length > 1 && (draft.push || draft.email)
    && draft.groups.length > 0 && areaOk && atOk;

  // How many people it would reach, as the audience and area change
  const { data: reach, isFetching: counting } = useQuery({
    queryKey: ['admin-broadcast-reach', draft?.groups.join(','), near ? `${draft?.location?.latitude},${draft?.location?.longitude},${radius}` : 'all'],
    enabled: !!draft && draft.groups.length > 0 && areaOk,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_broadcast_reach', {
        p_audience: draft!.groups,
        p_latitude: near ? draft!.location!.latitude : undefined,
        p_longitude: near ? draft!.location!.longitude : undefined,
        p_radius_km: near ? radius : undefined,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const toggleGroup = (g: Group, on: boolean) => draft && setDraft({ ...draft, groups: on ? [...draft.groups, g] : draft.groups.filter((x) => x !== g) });

  const send = async () => {
    if (!draft || !valid) return;
    const how = [draft.push ? 'a notification' : null, draft.email ? 'an email' : null].filter(Boolean).join(' and ');
    const where = near ? `within ${radius} km of ${draft.location!.place_name || draft.location!.formatted_address}` : 'everywhere';
    if (!(await confirm({
      title: later
        ? `Are you sure you want to schedule “${draft.title.trim()}”?`
        : `Are you sure you want to send “${draft.title.trim()}” now?`,
      description: `It goes as ${how} to ${groupNames(draft.groups).toLowerCase()} ${where}${
        reach !== undefined ? ` (about ${reach} ${reach === 1 ? 'person' : 'people'})` : ''
      }${later ? `, on ${format(new Date(draft.at), 'd MMM yyyy')} at ${format(new Date(draft.at), 'h:mm a')}` : ''}. ${
        later ? 'You can cancel it until then.' : 'It can’t be taken back once sent.'}`,
      confirmLabel: later ? 'Yes, schedule it' : 'Yes, send it',
    }))) return;

    setSaving(true);
    const { error } = await supabase.rpc('admin_save_broadcast', {
      p_title: draft.title.trim(),
      p_body: draft.body.trim(),
      p_audience: draft.groups,
      p_send_push: draft.push,
      p_send_email: draft.email,
      p_area_address: near ? draft.location!.formatted_address : undefined,
      p_latitude: near ? draft.location!.latitude : undefined,
      p_longitude: near ? draft.location!.longitude : undefined,
      p_radius_km: near ? radius : undefined,
      p_scheduled_at: later ? new Date(draft.at).toISOString() : undefined,
    });
    setSaving(false);
    if (error) return toast.error(errorMessage(error, 'Could not send the broadcast'));
    toast.success(later ? 'Broadcast scheduled' : 'Broadcast sent');
    setDraft(null);
    queryClient.invalidateQueries({ queryKey: ['admin-broadcasts'] });
  };

  const cancel = async (b: Broadcast) => {
    if (!(await confirm({
      title: `Are you sure you want to cancel “${b.title}”?`,
      description: 'It won’t be sent.',
      confirmLabel: 'Yes, cancel it',
      destructive: true,
    }))) return;
    const { error } = await supabase.rpc('admin_cancel_broadcast', { p_id: b.id });
    if (error) return toast.error(errorMessage(error, 'Could not cancel the broadcast'));
    toast.success('Broadcast cancelled');
    queryClient.invalidateQueries({ queryKey: ['admin-broadcasts'] });
  };

  return (
    <AdminPage
      title="Broadcasts"
      icon={Megaphone}
      description="Send an announcement to customers, vendors or riders: as a notification, an email, or both."
      actions={<Button onClick={() => setDraft(blank())}><Plus className="mr-1.5 h-4 w-4" /> New broadcast</Button>}
    >
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-muted" />)}</div>
          ) : broadcasts.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No broadcasts yet.</p>
          ) : (
            <PagedList
              items={broadcasts}
              getKey={(b) => b.id}
              paginationClassName="border-t p-3"
              render={(b, i) => (
                <div className={cn('flex items-start gap-3 p-3 sm:px-4', i > 0 && 'border-t')}>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="break-words">{b.title}</span>
                      <Badge variant="outline" className={cn('border-transparent', STATES[b.status]?.className)}>{STATES[b.status]?.label ?? b.status}</Badge>
                      {b.send_push && <Badge variant="outline" className="gap-1"><Bell className="h-3 w-3" /> Notification</Badge>}
                      {b.send_email && <Badge variant="outline" className="gap-1"><Mail className="h-3 w-3" /> Email</Badge>}
                    </p>
                    <p className="line-clamp-2 whitespace-pre-line break-words text-sm text-muted-foreground">{b.body}</p>
                    <p className="text-xs text-muted-foreground">
                      To {groupNames(b.audience).toLowerCase()}
                      {b.radius_km != null ? ` within ${Number(b.radius_km)} km of ${b.area_address ?? 'the chosen point'}` : ', everywhere'}
                      {' · '}
                      {b.status === 'sent' && b.sent_at
                        ? `sent ${format(new Date(b.sent_at), 'd MMM yyyy, h:mm a')} to ${b.recipients ?? 0} ${b.recipients === 1 ? 'person' : 'people'}${b.send_email ? ` (${b.emails_queued ?? 0} emails)` : ''}`
                        : `${b.status === 'cancelled' ? 'was due' : 'due'} ${format(new Date(b.scheduled_at), 'd MMM yyyy, h:mm a')}`}
                    </p>
                  </div>
                  {b.status === 'scheduled' && (
                    <Button variant="outline" size="sm" onClick={() => cancel(b)}>Cancel</Button>
                  )}
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!draft} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New broadcast</DialogTitle>
            <DialogDescription>
              People with push on get it on their phone too. Emails go only to people who haven't turned email
              notifications off.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bc-title">Title</Label>
                <Input id="bc-title" value={draft.title} maxLength={TITLE_MAX} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Free delivery this Saturday" />
                <p className="text-right text-xs text-muted-foreground">{draft.title.length}/{TITLE_MAX}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bc-body">Message</Label>
                <Textarea id="bc-body" rows={5} value={draft.body} maxLength={BODY_MAX} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  placeholder="What you want people to know. In an email, a blank line starts a new paragraph." />
                <p className="flex justify-between text-xs text-muted-foreground">
                  <span>{draft.push && draft.body.length > 180 ? 'A phone notification only shows about the first 180 characters.' : ''}</span>
                  <span>{draft.body.length}/{BODY_MAX}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Send as</Label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={draft.push} onCheckedChange={(c) => setDraft({ ...draft, push: !!c })} />
                  Notification in the app, with push
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={draft.email} onCheckedChange={(c) => setDraft({ ...draft, email: !!c })} />
                  Email
                </label>
                {!draft.push && !draft.email && <p className="text-xs text-destructive">Choose at least one.</p>}
              </div>

              <div className="space-y-2">
                <Label>Send to</Label>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {(Object.keys(GROUPS) as Group[]).map((g) => (
                    <label key={g} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={draft.groups.includes(g)} onCheckedChange={(c) => toggleGroup(g, !!c)} />
                      {GROUPS[g]}
                    </label>
                  ))}
                </div>
                {draft.groups.length === 0 && <p className="text-xs text-destructive">Choose at least one group.</p>}
              </div>

              <div className="space-y-2">
                <Label>Where</Label>
                <RadioGroup value={draft.area} onValueChange={(v) => setDraft({ ...draft, area: v as Draft['area'] })} className="gap-2">
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="all" /> Everyone in those groups</label>
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="near" /> Only people near a place</label>
                </RadioGroup>
                {near && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <MapLocationPicker value={draft.location} onChange={(l) => setDraft((d) => (d ? { ...d, location: l } : d))} />
                    {draft.location && (
                      <p className="flex items-start gap-1.5 text-sm">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="break-words">{draft.location.formatted_address}</span>
                      </p>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="bc-radius">Radius (km)</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input id="bc-radius" type="number" min={0.1} max={500} step="any" className="w-28" value={draft.radius} onChange={(e) => setDraft({ ...draft, radius: e.target.value })} />
                        {RADII.map((r) => (
                          <Button key={r} type="button" size="sm" variant={Number(draft.radius) === r ? 'default' : 'outline'} className="h-8" onClick={() => setDraft({ ...draft, radius: String(r) })}>
                            {r} km
                          </Button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Reaches people with a saved address inside the circle (a customer's delivery addresses, a vendor's
                      store, a rider's home) and riders whose last known location is inside it.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>When</Label>
                <RadioGroup value={draft.when} onValueChange={(v) => setDraft({ ...draft, when: v as Draft['when'] })} className="gap-2">
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="now" /> Now</label>
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="later" /> At a set time</label>
                </RadioGroup>
                {later && (
                  <>
                    <Input type="datetime-local" aria-label="Send time" value={draft.at} min={format(new Date(), "yyyy-MM-dd'T'HH:mm")} onChange={(e) => setDraft({ ...draft, at: e.target.value })} />
                    {!atOk && <p className="text-xs text-destructive">Choose a time in the future.</p>}
                  </>
                )}
              </div>

              <p className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                {draft.groups.length === 0 || !areaOk
                  ? near && !draft.location ? 'Choose a place on the map to see how many people it reaches.' : 'Choose who to send it to.'
                  : counting && reach === undefined ? 'Counting…'
                    : `This reaches ${reach ?? 0} ${reach === 1 ? 'person' : 'people'} right now.`}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button onClick={send} disabled={saving || !valid}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {later ? 'Schedule' : 'Send now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
};

export default AdminBroadcasts;
