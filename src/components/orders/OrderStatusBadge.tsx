import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { orderStatusLabel, orderStatusTone, type StatusTone } from '@/lib/orderStatus';

const TONE_CLASSES: Record<StatusTone, string> = {
  waiting: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  done: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  stopped: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
};

const OrderStatusBadge = ({ status, className }: { status: string; className?: string }) => (
  <Badge variant="outline" className={cn('border-transparent font-medium', TONE_CLASSES[orderStatusTone(status)], className)}>
    {orderStatusLabel(status)}
  </Badge>
);

export default OrderStatusBadge;
