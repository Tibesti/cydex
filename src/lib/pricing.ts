import type { QuoteStatus } from '@/hooks/useOrderQuote';

// Exact amounts, kobo included (e.g. ₦1,074.00)
export const formatNaira = (amount: number) =>
  `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Why an order can't be priced for delivery yet
export const quoteProblem = (status: QuoteStatus | undefined) => {
  switch (status) {
    case 'no_address':
      return 'Add a delivery address to see the delivery fee.';
    case 'no_store':
      return "This vendor hasn't set a store location yet, so they can't deliver.";
    case 'out_of_range':
      return 'This vendor is too far from your delivery address for us to deliver.';
    default:
      return null;
  }
};

// Withdrawal fee taken from the amount withdrawn. Must match payout_fee_rate()
// in the database (supabase/migrations/20260930100000_wallets_server_side.sql).
// It covers the bank transfer charge (Squad charges Cydex per transfer).
export const PAYOUT_FEE_RATE = 0.015;

// The smallest amount a vendor or rider can withdraw at once. Must match
// min_payout_amount() in the database (app_config 'min_payout_amount'),
// which refuses anything smaller.
export const MIN_PAYOUT_AMOUNT = 3000;
export const belowMinimumPayout = (amount: string | number) => {
  const value = Number(amount);
  return Number.isFinite(value) && value > 0 && value < MIN_PAYOUT_AMOUNT;
};

export const withdrawalBreakdown = (amount: number) => {
  const gross = Math.round(amount * 100) / 100;
  const fee = Math.round(gross * PAYOUT_FEE_RATE * 100) / 100;
  return { amount: gross, fee, received: Math.round((gross - fee) * 100) / 100 };
};
