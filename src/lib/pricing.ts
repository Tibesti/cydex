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
      return 'This vendor is more than 5 km from your delivery address.';
    default:
      return null;
  }
};
