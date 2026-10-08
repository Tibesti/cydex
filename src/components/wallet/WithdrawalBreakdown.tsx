import { formatNaira, PAYOUT_FEE_RATE, withdrawalBreakdown } from '@/lib/pricing';
import { cn } from '@/lib/utils';

// Shown while typing a withdrawal amount: the fee and what reaches the bank account
const WithdrawalBreakdown = ({ amount, available }: { amount: string; available: number }) => {
  const value = Number(amount);
  if (!amount || !Number.isFinite(value) || value <= 0) {
    return (
      <p className="text-xs text-muted-foreground">
        A {PAYOUT_FEE_RATE * 100}% withdrawal fee applies. It covers the bank transfer charge.
      </p>
    );
  }
  const { fee, received } = withdrawalBreakdown(value);
  const tooMuch = value > available;
  return (
    <div className={cn('space-y-1 rounded-lg border p-3 text-sm', tooMuch ? 'border-destructive/50 bg-destructive/5' : 'bg-muted/40')}>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Withdrawal</span>
        <span className="text-foreground">{formatNaira(value)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Fee ({PAYOUT_FEE_RATE * 100}%, covers the bank transfer charge)</span>
        <span className="text-foreground">−{formatNaira(fee)}</span>
      </div>
      <div className="flex justify-between border-t pt-1 font-semibold">
        <span className="text-foreground">You'll receive</span>
        <span className="text-foreground">{formatNaira(received)}</span>
      </div>
      {tooMuch && <p className="pt-1 text-xs text-destructive">That's more than your available balance.</p>}
    </div>
  );
};

export default WithdrawalBreakdown;
