import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { ID_TYPES, STATUS_LABELS, VEHICLE_TYPES, verificationDocUrl, type Verification } from '@/lib/verification';

export interface VerificationRow extends Verification {
  profile: { name: string | null; email: string | null; phone: string | null; avatar: string | null; store_banner_url: string | null } | null;
  category: { name: string } | null;
}

type Action = 'verify' | 'reject' | 'suspend' | 'reinstate';

const Field = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="break-words text-right font-medium">{value ?? '–'}</span>
  </div>
);

// One verification request: what was submitted, the document, and the decision
const VerificationReviewDialog = ({ row, onClose, onDone }: { row: VerificationRow | null; onClose: () => void; onDone: () => void }) => {
  const confirm = useConfirm();
  const [pending, setPending] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: address } = useQuery({
    queryKey: ['admin-address', row?.profile_id],
    enabled: !!row,
    queryFn: async () => {
      const { data } = await supabase.from('addresses').select('formatted_address').eq('profile_id', row!.profile_id).limit(1).maybeSingle();
      return data?.formatted_address ?? null;
    },
  });

  if (!row) return null;
  const docPath = row.role === 'vendor' ? row.business_license_path : row.id_document_path;
  const needsReason = pending === 'reject' || pending === 'suspend';

  const openDoc = async () => {
    try {
      window.open(await verificationDocUrl(docPath!), '_blank', 'noopener');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not open the document'));
    }
  };

  const decide = async (action: Action) => {
    const who = row.profile?.name || `this ${row.role}`;
    const ok = await confirm({
      title: `Are you sure you want to ${action} ${who}?`,
      description: {
        verify: row.role === 'vendor' ? 'Their store gets the verified badge.' : 'They can start taking deliveries straight away.',
        reject: `They'll see your reason and can submit again.`,
        suspend: row.role === 'vendor'
          ? 'Their store is hidden from customers and they can’t take orders until reinstated.'
          : 'They can’t take deliveries until reinstated.',
        reinstate: 'They go back to the status they had before the suspension.',
      }[action],
      confirmLabel: `Yes, ${action}`,
      destructive: action === 'reject' || action === 'suspend',
    });
    if (!ok) return;
    setSaving(true);
    const { error } = await supabase.rpc('admin_review_verification', {
      p_profile_id: row.profile_id,
      p_action: action,
      p_reason: reason.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      toast.error(errorMessage(error, 'Could not save the decision'));
      return;
    }
    toast.success({ verify: 'Verified', reject: 'Rejected', suspend: 'Suspended', reinstate: 'Reinstated' }[action]);
    setPending(null);
    setReason('');
    onDone();
  };

  const actions: Action[] =
    row.status === 'pending' ? ['verify', 'reject', 'suspend']
      : row.status === 'unverified' || row.status === 'rejected' ? ['verify', 'suspend']
        : row.status === 'verified' ? ['suspend']
          : ['reinstate'];

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {row.profile?.name || 'Unnamed'} <Badge variant="outline" className="capitalize">{row.role}</Badge>
            <Badge variant="secondary">{STATUS_LABELS[row.status]}</Badge>
          </DialogTitle>
          <DialogDescription>
            Submitted {row.submitted_at ? format(new Date(row.submitted_at), 'd MMM yyyy, h:mm a') : '–'}
          </DialogDescription>
        </DialogHeader>

        {row.role === 'vendor' && (row.profile?.store_banner_url || row.profile?.avatar) && (
          <div className="relative h-24 overflow-hidden rounded-lg bg-muted">
            {row.profile?.store_banner_url && <img src={row.profile.store_banner_url} alt="Banner" className="h-full w-full object-cover" />}
            {row.profile?.avatar && (
              <img src={row.profile.avatar} alt="Logo" className="absolute bottom-2 left-2 h-14 w-14 rounded-lg border-2 border-background object-cover" />
            )}
          </div>
        )}

        <div>
          <Field label="Email" value={row.profile?.email} />
          <Field label="Phone" value={row.profile?.phone} />
          <Field label="Address" value={address} />
          {row.role === 'vendor' ? (
            <>
              <Field label="Category" value={row.category?.name} />
              <Field label="Registered business" value={row.is_registered_business ? 'Yes' : 'No'} />
            </>
          ) : (
            <>
              <Field label="Vehicle" value={VEHICLE_TYPES.find((v) => v.value === row.vehicle_type)?.label ?? row.vehicle_type} />
              {row.vehicle_model && <Field label="Model / year / colour" value={`${row.vehicle_model} · ${row.vehicle_year ?? '–'} · ${row.vehicle_color ?? '–'}`} />}
              <Field label="Registration" value={row.vehicle_registration} />
              <Field label="ID type" value={ID_TYPES.find((t) => t.value === row.id_document_type)?.label} />
            </>
          )}
          {row.rejection_reason && <Field label="Last rejection" value={row.rejection_reason} />}
          {row.suspension_reason && <Field label="Suspended for" value={row.suspension_reason} />}
        </div>

        {docPath && (
          <Button variant="outline" onClick={openDoc}>
            <ExternalLink className="mr-2 h-4 w-4" />
            View {row.role === 'vendor' ? 'business licence' : 'ID document'}
          </Button>
        )}

        {needsReason && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Reason (sent to the {row.role})*</p>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The licence photo is blurry" maxLength={300} />
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:gap-2">
          {pending ? (
            <>
              <Button variant="ghost" onClick={() => { setPending(null); setReason(''); }} disabled={saving}>Back</Button>
              <Button
                variant={pending === 'verify' || pending === 'reinstate' ? 'default' : 'destructive'}
                disabled={saving || (needsReason && !reason.trim())}
                onClick={() => decide(pending)}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm {pending}
              </Button>
            </>
          ) : (
            actions.map((a) => (
              <Button
                key={a}
                variant={a === 'verify' || a === 'reinstate' ? 'default' : a === 'reject' ? 'outline' : 'destructive'}
                className="capitalize"
                onClick={() => (a === 'reject' || a === 'suspend' ? setPending(a) : decide(a))}
                disabled={saving}
              >
                {a}
              </Button>
            ))
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VerificationReviewDialog;
