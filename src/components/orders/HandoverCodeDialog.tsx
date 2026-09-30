import { useState } from 'react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { errorMessage } from '@/lib/address';

interface HandoverCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Resolves false when the code is wrong; throws for anything else. */
  onSubmit: (code: string) => Promise<boolean>;
  onConfirmed?: () => void;
}

// The receiving side of a handover: the vendor enters the rider's pickup code,
// the rider enters the customer's delivery code.
const HandoverCodeDialog = ({
  open, onOpenChange, title, description, confirmLabel, onSubmit, onConfirmed,
}: HandoverCodeDialogProps) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = (next: boolean) => {
    if (submitting) return;
    if (!next) {
      setCode('');
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (await onSubmit(code)) {
        setCode('');
        onOpenChange(false);
        onConfirmed?.();
      } else {
        setError('That code is incorrect. Check it and try again.');
        setCode('');
      }
    } catch (e) {
      setError(errorMessage(e, 'Could not check the code'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <InputOTP
            maxLength={4}
            pattern={REGEXP_ONLY_DIGITS}
            value={code}
            onChange={(v) => { setCode(v); setError(null); }}
            autoFocus
            inputMode="numeric"
          >
            <InputOTPGroup>
              {[0, 1, 2, 3].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />)}
            </InputOTPGroup>
          </InputOTP>
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={code.length !== 4 || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HandoverCodeDialog;
