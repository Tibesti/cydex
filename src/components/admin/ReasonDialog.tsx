import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/address';

interface ReasonDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  /** Label above the box; the person affected usually sees the reason */
  reasonLabel?: string;
  placeholder?: string;
  destructive?: boolean;
  /** false: reason optional */
  required?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

// Confirm an admin action that needs a reason (cancel, reject, suspend, hide)
const ReasonDialog = ({
  open, title, description, confirmLabel, reasonLabel = 'Reason', placeholder, destructive, required = true, onConfirm, onClose,
}: ReasonDialogProps) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (saving) return;
    setReason('');
    onClose();
  };

  const submit = async () => {
    setSaving(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
    } catch (e) {
      toast.error(errorMessage(e, 'Something went wrong'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription asChild><div>{description}</div></DialogDescription>}
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="admin-reason">{reasonLabel}{required ? '*' : ' (optional)'}</Label>
          <Textarea id="admin-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} rows={3} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close} disabled={saving}>Back</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={submit} disabled={saving || (required && !reason.trim())}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReasonDialog;
