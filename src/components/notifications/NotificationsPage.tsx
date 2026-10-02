import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell, CheckCheck, CircleCheck, CreditCard, MapPin, Package, PartyPopper, Truck, Undo2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/address';
import { toast } from 'sonner';
import { useNotifications, useNotificationsPage, type AppNotification } from '@/hooks/useNotifications';
import SimplePagination from '@/components/ui/simple-pagination';
import { useState } from 'react';

type Role = 'customer' | 'vendor' | 'rider';

const ICONS: Record<string, React.ElementType> = {
  welcome: PartyPopper,
  new_order: Package,
  payment_confirmed: CreditCard,
  order_accepted: CircleCheck,
  order_ready: Package,
  order_nearby: MapPin,
  rider_assigned: Truck,
  rider_heading_to_vendor: Truck,
  out_for_delivery: Truck,
  picked_up: Truck,
  delivered: CheckCheck,
  cancelled: XCircle,
  rejected: XCircle,
  refund: Undo2,
};

// Where tapping an order notification goes, per role
const orderLink = (role: Role, n: AppNotification): string | null => {
  const orderId = n.metadata?.order_id;
  if (!orderId) return null;
  if (role === 'customer') return `/customer/orders/${orderId}`;
  if (role === 'vendor') return `/vendor/orders/${orderId}`;
  return n.type === 'order_nearby' ? '/rider/available' : `/rider/order/${orderId}`;
};

const NotificationsPage = ({ role }: { role: Role }) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { unreadCount, markAllRead, markRead } = useNotifications();
  const { notifications, pageCount, isLoading } = useNotificationsPage(page);

  const open = (n: AppNotification) => {
    if (!n.is_read) markRead.mutate(n.id);
    const link = orderLink(role, n);
    if (link) navigate(link);
  };

  const onMarkAll = () =>
    markAllRead.mutate(undefined, { onError: (e) => toast.error(errorMessage(e, 'Could not mark notifications as read')) });

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : 'You’re all caught up'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onMarkAll} disabled={unreadCount === 0 || markAllRead.isPending}>
          <CheckCheck className="mr-2 h-4 w-4" />
          Mark all as read
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : notifications.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
          <Bell className="h-8 w-8" />
          <p>No notifications yet. Order updates will show up here.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/60',
                    !n.is_read && 'border-primary/40 bg-primary/5',
                  )}
                >
                  <span className="mt-0.5 rounded-full bg-muted p-2">
                    <Icon className="h-4 w-4 text-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn('truncate', !n.is_read && 'font-semibold')}>{n.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{n.message}</span>
                  </span>
                  {!n.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <SimplePagination
        page={page}
        pageCount={pageCount}
        onPageChange={(next) => {
          setPage(next);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
};

export default NotificationsPage;
