import { belowMinimumPayout, formatNaira, MIN_PAYOUT_AMOUNT, PAYOUT_FEE_RATE, withdrawalBreakdown } from '@/lib/pricing';
import { cn } from '@/lib/utils';

// Shown while typing a withdrawal amount (vendors and riders): the minimum,
// the fee and what reaches the bank account
const WithdrawalBreakdown = ({ amount, available }: { amount: string; available: number }) => {
  const value = Number(amount);
  if (!amount || !Number.isFinite(value) || value <= 0) {
    return (
      <p className="text-xs text-muted-foreground">
        The smallest amount you can withdraw is ₦{MIN_PAYOUT_AMOUNT.toLocaleString()}. A {PAYOUT_FEE_RATE * 100}% withdrawal fee
        applies; it covers the bank transfer charge.
      </p>
    );
  }
  const { fee, received } = withdrawalBreakdown(value);
  const tooMuch = value > available;
  const tooLittle = belowMinimumPayout(value);
  return (
    <div className={cn('space-y-1 rounded-lg border p-3 text-sm', tooMuch || tooLittle ? 'border-destructive/50 bg-destructive/5' : 'bg-muted/40')}>
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
      {tooLittle && (
        <p className="pt-1 text-xs text-destructive">
          The smallest amount you can withdraw is ₦{MIN_PAYOUT_AMOUNT.toLocaleString()}.
          {available < MIN_PAYOUT_AMOUNT ? ` You have ${formatNaira(available)} available, so you can withdraw once you reach it.` : ''}
        </p>
      )}
      {tooMuch && <p className="pt-1 text-xs text-destructive">That's more than your available balance.</p>}
    </div>
  );
};

export default WithdrawalBreakdown;
