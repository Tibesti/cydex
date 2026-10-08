import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft, Ban, Bike, KeyRound, Lock, MapPin, Package, Phone, ScrollText, Star, Store, Unlock, User,
} from 'lucide-react';
import { toast } from 'sonner';
import AdminPage from '@/components/admin/AdminPage';
import AdminRiderActionDialog, { type RiderAction } from '@/components/admin/AdminRiderActionDialog';
import PaymentStatusBadge from '@/components/admin/PaymentStatusBadge';
import ReasonDialog from '@/components/admin/ReasonDialog';
import { addressText, type AdminOrderDetail, type AdminPerson } from '@/components/admin/orders/orderDetailTypes';
import OrderStatusBadge from '@/components/orders/OrderStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { CLOSED_STATUSES, type OrderStatus } from '@/lib/orderStatus';
import { formatNaira } from '@/lib/pricing';
import { cn } from '@/lib/utils';

const when = (d: string | null | undefined) => (d ? format(new Date(d), 'd MMM yyyy, HH:mm') : '–');
const naira = (n: number | string | null | undefined) => formatNaira(Number(n ?? 0));

const ACTION_LABELS: Record<string, string> = {
  cancel_order: 'Cancelled and refunded',
  relieve_rider: 'Relieved the rider',
  reassign_order: 'Gave the order to another rider',
  unlock_handover_code: 'Unlocked a handover code',
};

const Row = ({ label, value, strong, className }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; className?: string }) => (
  <div className={cn('flex items-baseline justify-between gap-3 py-1 text-sm', strong && 'font-semibold', className)}>
    <span className={strong ? undefined : 'text-muted-foreground'}>{label}</span>
    <span className="text-right">{value}</span>
  </div>
);

const Person = ({ title, icon: Icon, person, extra }: { title: string; icon: React.ElementType; person: AdminPerson | null; extra?: React.ReactNode }) => (
  <div className="space-y-1">
    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {title}
    </p>
    {person ? (
      <>
        <p className="font-medium">{person.name || 'Unnamed'}</p>
        {person.phone ? (
          <a href={`tel:${person.phone}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
            <Phone className="h-3.5 w-3.5" /> {person.phone}
          </a>
        ) : <p className="text-sm text-muted-foreground">No phone</p>}
        {person.email && <p className="break-all text-xs text-muted-foreground">{person.email}</p>}
        {extra}
      </>
    ) : <p className="text-sm text-muted-foreground">None yet</p>}
  </div>
);

// Admin: everything about one order or rider request, with the support actions
const OrderDetail = () => {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [riderAction, setRiderAction] = useState<RiderAction | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-order', id],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_order_detail', { p_order_id: id });
      if (error) throw error;
      return data as unknown as AdminOrderDetail;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-order', id] });
    queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    queryClient.invalidateQueries({ queryKey: ['admin-attention'] });
  };

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
      <Link to="/admin/orders"><ArrowLeft className="mr-1 h-4 w-4" /> All orders</Link>
    </Button>
  );

  if (isLoading || !data) {
    return (
      <AdminPage title="Order" icon={Package}>
        {back}
        {error ? <p className="text-destructive">{errorMessage(error, 'Could not load this order')}</p>
          : <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />)}</div>}
      </AdminPage>
    );
  }

  const { order: o, customer, vendor, rider, pickup, items, hold, split, codes, delivery, transactions, ratings, admin_actions } = data;
  const isRequest = o.order_type === 'rider_request';
  const closed = CLOSED_STATUSES.includes(o.status as OrderStatus);
  const recipient = (o.delivery_address ?? {}) as Record<string, string | undefined>;
  const serviceCharge = Number(o.service_charge ?? 0);
  const deliveryFee = Number(o.delivery_fee ?? 0);

  // Who gets what (final once delivered; expected while the money is held)
  const money = split ?? (hold && {
    paid_by: isRequest ? 'vendor' : 'customer',
    amount_paid: Number(o.total_amount),
    vendor_got: Number(hold.vendor_amount),
    rider_got: Number(hold.rider_amount),
    cydex_from_customer: isRequest ? 0 : serviceCharge,
    cydex_from_vendor: Number(hold.platform_fee) + (isRequest ? serviceCharge : 0),
    cydex_from_rider: deliveryFee - Number(hold.rider_amount),
    cydex_total: serviceCharge + Number(hold.platform_fee) + deliveryFee - Number(hold.rider_amount),
  });

  const timeline = [
    { at: o.created_at, label: isRequest ? 'Request created' : 'Order placed' },
    { at: hold?.created_at, label: isRequest ? 'Paid by vendor' : 'Paid' },
    { at: isRequest ? null : o.vendor_accepted_at, label: 'Vendor accepted' },
    { at: o.ready_for_pickup_at, label: 'Ready for pickup' },
    { at: o.rider_assigned_at, label: `Rider assigned${rider?.name ? ` (${rider.name})` : ''}` },
    { at: o.pickup_started_at, label: 'Rider heading to vendor' },
    { at: o.picked_up_at, label: 'Picked up' },
    { at: o.delivered_at, label: 'Delivered' },
    {
      at: o.cancelled_at,
      label: `${o.status === 'rejected' ? 'Rejected by vendor' : o.cancelled_by === 'admin' ? 'Cancelled by Cydex' : 'Cancelled'}${o.cancel_reason ? `: ${o.cancel_reason}` : ''}`,
    },
  ].filter((t): t is { at: string; label: string } => !!t.at)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const unlock = async (kind: string) => {
    if (!(await confirm({
      title: `Are you sure you want to unlock the ${kind} code?`,
      description: `The ${kind === 'pickup' ? 'vendor' : 'rider'} gets another 5 tries. Only do this once you've confirmed who they're talking to.`,
      confirmLabel: 'Yes, unlock',
    }))) return;
    const { error } = await supabase.rpc('admin_unlock_handover_code', { p_order_id: o.id, p_kind: kind });
    if (error) toast.error(errorMessage(error, 'Could not unlock the code'));
    else { toast.success('Code unlocked. They can try again.'); refresh(); }
  };

  const canRelieve = ['rider_assigned', 'picking_up'].includes(o.status);
  const canReassign = ['ready_for_pickup', 'rider_assigned', 'picking_up'].includes(o.status);

  return (
    <AdminPage
      title={<span className="flex flex-wrap items-center gap-2">#{o.order_number}{isRequest && <Badge variant="outline">Rider request</Badge>}</span>}
      description={`${isRequest ? 'Requested' : 'Placed'} ${when(o.created_at)}`}
      icon={Package}
      actions={
        <div className="flex flex-wrap gap-2">
          {canRelieve && <Button variant="outline" size="sm" onClick={() => setRiderAction('relieve')}>Relieve rider</Button>}
          {canReassign && (
            <Button variant="outline" size="sm" onClick={() => setRiderAction('reassign')}>
              {o.rider_id ? 'Reassign rider' : 'Assign a rider'}
            </Button>
          )}
          {!closed && (
            <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
              <Ban className="mr-1.5 h-4 w-4" /> Cancel & refund
            </Button>
          )}
        </div>
      }
    >
      {back}
      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={o.status} />
        <PaymentStatusBadge status={o.payment_status} />
        {o.dispatch_priority > 0 && <Badge variant="secondary">Top priority for riders</Badge>}
        {o.cancelled_by === 'admin' && <Badge variant="secondary">Cancelled by Cydex</Badge>}
      </div>
      {o.cancel_reason && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span className="font-medium">{o.status === 'rejected' ? 'Rejection' : 'Cancellation'} reason:</span> {o.cancel_reason}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* People */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">People</CardTitle></CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-3">
              {isRequest ? (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <User className="h-3.5 w-3.5" /> Recipient
                  </p>
                  <p className="font-medium">{recipient.name || '–'}</p>
                  {recipient.phone && (
                    <a href={`tel:${recipient.phone}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                      <Phone className="h-3.5 w-3.5" /> {recipient.phone}
                    </a>
                  )}
                  <p className="text-xs text-muted-foreground">The vendor's own customer (no Cydex account)</p>
                </div>
              ) : (
                <Person title="Customer" icon={User} person={customer}
                  extra={customer?.status === 'suspended' && <Badge variant="destructive">Suspended</Badge>} />
              )}
              <Person title={isRequest ? 'Vendor (paid)' : 'Vendor'} icon={Store} person={vendor}
                extra={vendor?.verification_status && <Badge variant="outline" className="capitalize">{vendor.verification_status}</Badge>} />
              <Person title="Rider" icon={Bike} person={rider}
                extra={rider && (
                  <p className="text-xs capitalize text-muted-foreground">
                    {[rider.vehicle_type, rider.rating ? `★ ${Number(rider.rating).toFixed(1)}` : null, rider.rider_status].filter(Boolean).join(' · ')}
                  </p>
                )} />
            </CardContent>
          </Card>

          {/* Route */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Pickup and drop-off</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Pickup ({vendor?.name ?? 'vendor'})</p>
                  <p className="break-words">{addressText(pickup) || 'No store address'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Drop-off</p>
                  <p className="break-words">{addressText(o.delivery_address) || '–'}</p>
                  {(recipient.additional_info || recipient.directions) && (
                    <p className="text-xs text-muted-foreground">Directions: {recipient.additional_info || recipient.directions}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {o.distance_km != null && <span>{Number(o.distance_km).toFixed(1)} km</span>}
                <span className="capitalize">{o.delivery_type} delivery</span>
              </div>
              {o.special_instructions && (
                <p className="rounded-md bg-muted p-2 text-sm">
                  <span className="font-medium">{isRequest ? 'Package: ' : 'Note: '}</span>{o.special_instructions}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          {!isRequest && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Items ({items.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {items.map((i, n) => (
                    <li key={n} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="min-w-0 truncate">{i.quantity} × {i.name}</span>
                      <span className="shrink-0 text-muted-foreground">{naira(i.unit_price)} each · <span className="font-medium text-foreground">{naira(i.total_price)}</span></span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Money */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Money</CardTitle></CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  What the {isRequest ? 'vendor' : 'customer'} paid
                </p>
                {!isRequest && <Row label="Items" value={naira(o.subtotal)} />}
                <Row label={`Delivery fee${o.distance_km != null ? ` (${Number(o.distance_km).toFixed(1)} km, minimum ₦${Number(o.base_rate ?? 0).toLocaleString()})` : ''}`} value={naira(deliveryFee)} />
                <Row label={isRequest ? 'Commission' : 'Service Charge'} value={naira(serviceCharge)} />
                <Row label="Total" value={naira(o.total_amount)} strong className="border-t pt-2" />
                {Number(o.wallet_amount) > 0 && (
                  <Row label="From wallet / by card" value={`${naira(o.wallet_amount)} / ${naira(Number(o.total_amount) - Number(o.wallet_amount))}`} />
                )}
                <Row label="Method" value={<span className="capitalize">{[o.payment_gateway, o.payment_method].filter(Boolean).join(' · ') || '–'}</span>} />
                {o.payment_reference && <Row label="Reference" value={<span className="break-all font-mono text-xs">{o.payment_reference}</span>} />}
                {o.payment_status === 'refunded' && (
                  <p className="mt-2 rounded-md bg-muted p-2 text-xs">
                    Refunded to the {isRequest ? "vendor's" : "customer's"} Cydex wallet.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Split {split ? '(settled)' : hold ? `(${hold.status === 'held' ? 'held until delivery' : hold.status})` : ''}
                </p>
                {money && o.payment_status !== 'refunded' ? (
                  <>
                    {!isRequest && <Row label="Vendor gets" value={naira(money.vendor_got)} />}
                    <Row label="Rider gets" value={naira(money.rider_got)} />
                    <Row label="Cydex from customer" value={naira(money.cydex_from_customer)} />
                    <Row label="Cydex from vendor" value={naira(money.cydex_from_vendor)} />
                    <Row label="Cydex from rider" value={naira(money.cydex_from_rider)} />
                    <Row label="Cydex total" value={naira(money.cydex_total)} strong className="border-t pt-2" />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {o.payment_status === 'refunded' ? 'Nothing kept: the payment was refunded.' : 'Not paid yet.'}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {transactions.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Wallet movements</CardTitle></CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {transactions.map((t, n) => (
                    <li key={n} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate"><span className="capitalize">{t.who}</span> · {t.description || t.type}</p>
                        <p className="text-xs text-muted-foreground">{when(t.created_at)} · {t.status}</p>
                      </div>
                      <span className="shrink-0 font-medium">{naira(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-3 border-l pl-4">
                {timeline.map((t, n) => (
                  <li key={n} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{when(t.at)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> Handover codes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {codes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Created when the {isRequest ? 'request is paid' : 'vendor accepts'}.</p>
              ) : codes.map((c) => (
                <div key={c.kind} className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium capitalize">{c.kind} code</p>
                    <p className="text-xs text-muted-foreground">
                      {c.used_at ? `Used ${when(c.used_at)}` : c.locked ? 'Locked after 5 wrong tries'
                        : `Not used yet${c.failed_attempts ? ` · ${c.failed_attempts} wrong ${c.failed_attempts === 1 ? 'try' : 'tries'}` : ''}`}
                    </p>
                  </div>
                  {c.locked ? (
                    <Button size="sm" variant="outline" onClick={() => unlock(c.kind)} disabled={closed}>
                      <Unlock className="mr-1.5 h-4 w-4" /> Unlock
                    </Button>
                  ) : c.used_at ? <Badge variant="secondary">Used</Badge> : <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Admins can't see the digits. The vendor (pickup) and {isRequest ? 'vendor' : 'customer'} (delivery) see them in the app.</p>
            </CardContent>
          </Card>

          {(ratings.vendor || ratings.rider) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Star className="h-4 w-4" /> Ratings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(['vendor', 'rider'] as const).map((k) => ratings[k] && (
                  <div key={k}>
                    <p className="font-medium capitalize">{k}: {'★'.repeat(ratings[k]!.rating)}{ratings[k]!.hidden_at && <Badge variant="outline" className="ml-2">Hidden</Badge>}</p>
                    {ratings[k]!.feedback && <p className="text-muted-foreground">“{ratings[k]!.feedback}”</p>}
                  </div>
                ))}
                <Link to="/admin/reviews" className="text-xs text-primary hover:underline">Manage reviews</Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><ScrollText className="h-4 w-4" /> Admin actions</CardTitle>
            </CardHeader>
            <CardContent>
              {admin_actions.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="space-y-2">
                  {admin_actions.map((a, n) => (
                    <li key={n} className="text-sm">
                      <p className="font-medium">{ACTION_LABELS[a.action] ?? a.action.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.admin ?? 'Admin'} · {when(a.created_at)}
                        {a.details?.reason ? ` · “${String(a.details.reason)}”` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {delivery && (
            <p className="px-1 text-xs text-muted-foreground">
              Delivery record: <span className="capitalize">{delivery.status.replace(/_/g, ' ')}</span>
            </p>
          )}
        </div>
      </div>

      <ReasonDialog
        open={cancelOpen}
        title={`Are you sure you want to cancel #${o.order_number}?`}
        description={
          <span>
            {o.payment_status === 'paid'
              ? `${naira(Number(o.total_amount) - Number(o.wallet_refunded ?? 0))} goes back to the ${isRequest ? "vendor's" : "customer's"} Cydex wallet. `
              : 'It hasn’t been paid, so there’s nothing to refund. '}
            The {isRequest ? 'vendor' : 'customer, vendor'}{o.rider_id ? ' and rider' : ''} will be told, with your reason.
          </span>
        }
        confirmLabel="Yes, cancel and refund"
        placeholder="e.g. The vendor closed early and can't prepare it"
        destructive
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          const { error } = await supabase.rpc('admin_cancel_order', { p_order_id: o.id, p_reason: reason });
          if (error) throw error;
          toast.success('Order cancelled and refunded');
          setCancelOpen(false);
          refresh();
        }}
      />

      <AdminRiderActionDialog
        action={riderAction}
        order={{ id: o.id, order_number: o.order_number, rider }}
        onClose={() => setRiderAction(null)}
        onDone={() => { setRiderAction(null); refresh(); }}
      />
    </AdminPage>
  );
};

export default OrderDetail;
