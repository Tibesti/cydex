import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const CLASSES: Record<string, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  refunded: 'bg-muted text-muted-foreground',
};
const LABELS: Record<string, string> = { paid: 'Paid', pending: 'Not paid', failed: 'Payment failed', refunded: 'Refunded' };

const PaymentStatusBadge = ({ status, className }: { status: string; className?: string }) => (
  <Badge variant="outline" className={cn('border-transparent font-medium', CLASSES[status] ?? CLASSES.refunded, className)}>
    {LABELS[status] ?? status}
  </Badge>
);

export default PaymentStatusBadge;
