import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { cn } from '@/lib/utils';

export type RiderAction = 'relieve' | 'reassign';

interface AdminRiderActionDialogProps {
  action: RiderAction | null;
  order: { id: string; order_number: string; rider?: { name?: string | null } | null } | null;
  onClose: () => void;
  onDone: () => void;
}

// Admin: take an order off its rider (back to the pool, top priority) or give
// it to a chosen verified rider. Both need a reason, which the old rider sees.
const AdminRiderActionDialog = ({ action, order, onClose, onDone }: AdminRiderActionDialogProps) => {
  const [reason, setReason] = useState('');
  const [riderId, setRiderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['admin-rider-candidates', order?.id],
    enabled: action === 'reassign' && !!order,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_rider_candidates', { p_order_id: order!.id });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!action || !order) return null;

  const close = () => {
    if (saving) return;
    setReason('');
    setRiderId(null);
    onClose();
  };

  const submit = async () => {
    setSaving(true);
    const { error } =
      action === 'relieve'
        ? await supabase.rpc('admin_relieve_rider', { p_order_id: order.id, p_reason: reason.trim() })
        : await supabase.rpc('admin_reassign_order', { p_order_id: order.id, p_rider_id: riderId!, p_reason: reason.trim() });
    setSaving(false);
    if (error) {
      toast.error(errorMessage(error, 'Could not update the order'));
      return;
    }
    toast.success(action === 'relieve' ? 'Rider relieved. The order is back with nearby riders, first in line.' : 'Order reassigned');
    setReason('');
    setRiderId(null);
    onDone();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{action === 'relieve' ? 'Relieve rider' : 'Reassign order'} · #{order.order_number}</DialogTitle>
          <DialogDescription>
            {action === 'relieve'
              ? `${order.rider?.name ?? 'The rider'} is taken off the order. It goes back to nearby riders at the top of their list, and they're alerted again. The pickup code changes.`
              : 'Choose a verified rider. The order is theirs straight away, the previous rider (if any) is taken off, and the pickup code changes.'}
          </DialogDescription>
        </DialogHeader>

        {action === 'reassign' && (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-1">
            {isLoading ? (
              <div className="h-16 animate-pulse rounded bg-muted" />
            ) : candidates.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No verified riders yet.</p>
            ) : (
              candidates.map((c) => (
                <button
                  key={c.rider_id}
                  type="button"
                  disabled={c.busy}
                  onClick={() => setRiderId(c.rider_id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-md p-2 text-left text-sm',
                    riderId === c.rider_id ? 'bg-primary/15' : 'hover:bg-muted',
                    c.busy && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name || 'Rider'}</span>
                    <span className="block text-xs text-muted-foreground">{c.phone || 'No phone'}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {c.busy ? 'On a delivery' : c.online ? 'Online' : 'Offline'}
                    {c.distance_km != null && ` · ${Number(c.distance_km).toFixed(1)} km`}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Reason*</p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={action === 'relieve' ? "e.g. Rider hasn't moved for 40 minutes" : 'e.g. Closer rider available'}
            maxLength={300}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !reason.trim() || (action === 'reassign' && !riderId)}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {action === 'relieve' ? 'Relieve rider' : 'Reassign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminRiderActionDialog;
