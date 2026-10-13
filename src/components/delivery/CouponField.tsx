import { useEffect, useState } from 'react';
import { Loader2, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  /** The code being tried or applied (null = none) */
  coupon: string | null;
  onChange: (code: string | null) => void;
  /** What the latest quote said about it */
  status: 'none' | 'applied' | 'invalid' | undefined;
  promotionName?: string | null;
  /** Why the code wasn't accepted, from the quote (e.g. "This coupon has been fully claimed.") */
  message?: string | null;
  /** How many more times they can use the applied promotion (null: no limit) */
  usesLeft?: number | null;
  /** The quote for this code is still loading */
  checking?: boolean;
  disabled?: boolean;
  /** "order" or "delivery", for the not-valid message */
  thing?: string;
  id?: string;
}

// Coupon code entry for a checkout. The quote decides whether the code is
// valid; this only collects it and shows the answer.
const CouponField = ({ coupon, onChange, status, promotionName, message, usesLeft, checking, disabled, thing = 'order', id = 'coupon-code' }: Props) => {
  const [draft, setDraft] = useState(coupon ?? '');
  // A code chosen elsewhere (tapping one of their offers) shows in the box too
  useEffect(() => {
    if (coupon) setDraft(coupon);
  }, [coupon]);

  const apply = () => {
    const code = draft.replace(/\s/g, '').toUpperCase();
    if (code) onChange(code);
  };
  const applied = !!coupon && status === 'applied';

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Coupon code (optional)</Label>
      {applied ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-green-600/40 bg-green-600/10 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2 text-green-700 dark:text-green-400">
            <Tag className="h-4 w-4 shrink-0" />
            <span className="truncate">{coupon} applied{promotionName ? ` · ${promotionName}` : ''}</span>
          </span>
          <button
            type="button"
            aria-label="Remove coupon"
            disabled={disabled}
            onClick={() => { setDraft(''); onChange(null); }}
            className="rounded-full p-1 hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            id={id}
            value={draft}
            onChange={(e) => { setDraft(e.target.value.toUpperCase()); if (coupon) onChange(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
            placeholder="Enter code"
            maxLength={30}
            autoComplete="off"
            disabled={disabled}
          />
          <Button type="button" variant="outline" onClick={apply} disabled={disabled || !draft.trim() || (!!coupon && checking)}>
            {!!coupon && checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
          </Button>
        </div>
      )}
      {applied && usesLeft != null && (
        <p className="text-xs text-muted-foreground">
          {usesLeft <= 1 ? 'This is the last time you can use it.' : `You can use it ${usesLeft} times, including this ${thing}.`}
        </p>
      )}
      {!!coupon && !checking && status === 'invalid' && (
        <p className="text-xs text-destructive">{message || `That coupon code isn't valid for this ${thing}.`}</p>
      )}
    </div>
  );
};

export default CouponField;
