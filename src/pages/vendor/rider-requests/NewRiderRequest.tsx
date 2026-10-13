import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { MapLocationPicker } from '@/components/address/AddressPickerDialog';
import CouponField from '@/components/delivery/CouponField';
import CheckoutOffers from '@/components/promotions/CheckoutOffers';
import { MY_PROMOTIONS_KEY } from '@/hooks/useMyPromotions';
import DeliveryModeSelect from '@/components/delivery/DeliveryModeSelect';
import { useVehicleTypes } from '@/hooks/useVehicleTypes';
import SavedCustomerPicker, { type SavedCustomer } from '@/components/vendor/rider-requests/SavedCustomerPicker';
import VendorPhoneNotice from '@/components/vendor/VendorPhoneNotice';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useHasPhone } from '@/hooks/useHasPhone';
import { invokeFunction } from '@/lib/edgeFunctions';
import { addressHeadline, errorMessage } from '@/lib/address';
import { NO_RIDERS_MESSAGE, type DeliveryMode } from '@/lib/deliveryModes';
import { isValidEmail, isValidPhone } from '@/lib/phone';
import { formatNaira } from '@/lib/pricing';
import type { PickedLocation } from '@/lib/googleMaps';

interface Stop {
  id: number;
  name: string;
  phone: string;
  email: string;
  location: PickedLocation | null;
  directions: string;
  packageDetails: string;
  saveCustomer: boolean;
  savedId: string | null;
  mapKey: number;
}

interface Leg { status: string; distance_km: number; delivery_fee: number; commission: number; total_amount: number }
interface Quote {
  status: string; distance_km?: number; vehicle_type?: string; delivery_fee?: number; commission?: number; total_amount?: number;
  wallet_balance: number; wallet_amount?: number; card_amount?: number; riders_available?: boolean; modes?: DeliveryMode[];
  stops?: Leg[]; max_stops?: number;
  // Promotions and coupons (single requests)
  discount_amount?: number; promotion_name?: string | null; coupon_status?: 'none' | 'applied' | 'invalid';
  coupon_message?: string | null; promotion_uses_left?: number | null;
}

let nextId = 1;
const newStop = (): Stop => ({
  id: nextId++, name: '', phone: '', email: '', location: null, directions: '', packageDetails: '', saveCustomer: true, savedId: null, mapKey: 0,
});
const stopReady = (s: Stop) => s.name.trim().length > 0 && isValidPhone(s.phone) && isValidEmail(s.email) && !!s.location;

// A vendor asks for a rider to deliver orders their customers placed with them
// directly: one delivery, or a batch of drop-offs one rider collects together.
// They pay the delivery fee + commission for each drop-off: wallet first, card
// for the rest (create_rider_request / create_rider_batch in the database).
const NewRiderRequest = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const hasPhone = useHasPhone();
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [stops, setStops] = useState<Stop[]>(() => [newStop()]);
  const [vehicle, setVehicle] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const batch = mode === 'batch';
  const { maxTripText } = useVehicleTypes();

  const { data: saved = [] } = useQuery({
    queryKey: ['vendor-customers', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('vendor_customers').select('*').eq('vendor_id', user!.id).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const located = stops.filter((s) => s.location);
  const allLocated = located.length === stops.length;
  const { data: quote, isFetching: quoting } = useQuery({
    queryKey: ['rider-request-quote', mode, vehicle, batch ? null : coupon, ...stops.map((s) => `${s.location?.latitude},${s.location?.longitude}`)],
    enabled: allLocated,
    queryFn: async () => {
      const { data, error } = batch
        ? await supabase.rpc('batch_quote', {
          p_stops: stops.map((s) => ({ latitude: s.location!.latitude, longitude: s.location!.longitude })),
          p_vehicle_type: vehicle ?? undefined,
        })
        : await supabase.rpc('rider_request_quote', {
          p_latitude: stops[0].location!.latitude, p_longitude: stops[0].location!.longitude, p_vehicle_type: vehicle ?? undefined,
          p_coupon_code: coupon ?? undefined,
        });
      if (error) throw error;
      return data as unknown as Quote;
    },
  });
  const maxStops = quote?.max_stops ?? 5;

  const update = (id: number, patch: Partial<Stop>) => setStops((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const switchMode = (m: 'single' | 'batch') => {
    setMode(m);
    setStops((all) => (m === 'single' ? all.slice(0, 1) : all.length < 2 ? [...all, newStop()] : all));
  };

  const pickSaved = (stop: Stop, c: SavedCustomer) => update(stop.id, {
    savedId: c.id, name: c.name, phone: c.phone, email: c.email ?? '', directions: c.directions ?? '',
    location: {
      place_name: c.place_name, formatted_address: c.formatted_address, street: c.street, city: c.city, state: c.state,
      country: c.country, place_id: c.place_id, latitude: c.latitude, longitude: c.longitude,
    },
    mapKey: stop.mapKey + 1,
  });

  const removeSaved = async (c: SavedCustomer) => {
    if (!(await confirm({ title: `Are you sure you want to remove ${c.name} from your saved customers?`, confirmLabel: 'Yes, remove', destructive: true }))) return;
    const { error } = await supabase.from('vendor_customers').delete().eq('id', c.id);
    if (error) return toast.error(errorMessage(error, 'Could not remove customer'));
    setStops((all) => all.map((s) => (s.savedId === c.id ? { ...s, savedId: null } : s)));
    queryClient.invalidateQueries({ queryKey: ['vendor-customers', user?.id] });
  };

  const badLeg = quote?.stops?.findIndex((l) => l.status === 'out_of_range') ?? -1;
  const problem =
    !quote ? null
      : quote.status === 'no_store' ? 'Set your store location in Settings first.'
        : quote.status === 'out_of_range'
          ? batch && badLeg >= 0
            ? `Drop-off ${badLeg + 1} is more than ${maxTripText} from ${badLeg === 0 ? 'your store' : `drop-off ${badLeg}`}, which is further than we deliver.`
            : `This location is more than ${maxTripText} from your store, which is further than we deliver.`
          : quote.riders_available === false ? NO_RIDERS_MESSAGE
            : null;
  const canSubmit = hasPhone && stops.every(stopReady) && quote?.status === 'ok' && quote.riders_available !== false && !submitting;
  const chosenVehicle = quote?.vehicle_type ?? vehicle;

  const payByCard = async (number: string, fallback: string) => {
    try {
      const { checkout_url } = await invokeFunction<{ checkout_url: string }>('squad-checkout', { action: 'initiate', order_number: number });
      window.location.href = checkout_url;
    } catch (e) {
      toast.error(errorMessage(e, 'Could not start the card payment. You can pay from the request page.'));
      navigate(fallback);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (batch) {
        const { data, error } = await supabase.rpc('create_rider_batch', {
          p_stops: stops.map((s) => ({
            name: s.name.trim(), phone: s.phone.trim(), email: s.email.trim(),
            location: { ...s.location, directions: s.directions.trim() || null },
            package_details: s.packageDetails.trim() || null,
            save_customer: s.saveCustomer && !s.savedId,
          })),
          p_vehicle_type: chosenVehicle ?? undefined,
        });
        if (error) throw error;
        const b = data as unknown as { batch_id: string; batch_number: string; paid: boolean };
        queryClient.invalidateQueries({ queryKey: ['rider-requests'] });
        queryClient.invalidateQueries({ queryKey: ['vendor-customers', user?.id] });
        if (b.paid) {
          toast.success('Paid from your wallet. Nearby riders have been notified.');
          navigate(`/vendor/rider-requests?batch=${b.batch_id}`);
        } else {
          await payByCard(b.batch_number, `/vendor/rider-requests?batch=${b.batch_id}`);
        }
        return;
      }

      const s = stops[0];
      const { data: order, error } = await supabase.rpc('create_rider_request', {
        p_recipient_name: s.name.trim(),
        p_recipient_phone: s.phone.trim(),
        p_recipient_email: s.email.trim(),
        p_location: { ...s.location, directions: s.directions.trim() || null },
        p_package_details: s.packageDetails.trim() || undefined,
        p_save_customer: s.saveCustomer && !s.savedId,
        p_vehicle_type: chosenVehicle ?? undefined,
        p_coupon_code: coupon && quote?.coupon_status === 'applied' ? coupon : undefined,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['rider-requests'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-customers', user?.id] });
      queryClient.invalidateQueries({ queryKey: [MY_PROMOTIONS_KEY] });
      if (order.status === 'ready_for_pickup') {
        toast.success('Paid from your wallet. Nearby riders have been notified.');
        navigate(`/vendor/rider-requests/${order.id}`);
      } else {
        // Pay the rest by card; Squad brings them back to the request page
        await payByCard(order.order_number, `/vendor/rider-requests/${order.id}`);
      }
    } catch (e) {
      toast.error(errorMessage(e, 'Could not create the request'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout userRole="VENDOR">
      <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-4 md:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/vendor/rider-requests')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Rider requests
        </Button>
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">New rider request</h1>
          <p className="text-sm text-muted-foreground">
            A rider collects from your store and delivers to your customer{batch ? 's, one after another' : ''}.
          </p>
        </div>

        {!hasPhone && <VendorPhoneNotice />}

        <Tabs value={mode} onValueChange={(v) => switchMode(v as 'single' | 'batch')}>
          <TabsList className="grid w-full grid-cols-2 sm:w-80">
            <TabsTrigger value="single">Single delivery</TabsTrigger>
            <TabsTrigger value="batch">Batch drop-offs</TabsTrigger>
          </TabsList>
        </Tabs>
        {batch && (
          <p className="text-sm text-muted-foreground">
            One rider collects everything with one pickup code and delivers in the order below. Each drop-off is priced
            from the stop before it and has its own delivery code.
          </p>
        )}

        {stops.map((stop, index) => (
          <Card key={stop.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                {batch ? `Drop-off ${index + 1}` : 'Customer and delivery'}
                {batch && stops.length > 2 && (
                  <Button variant="ghost" size="sm" onClick={() => setStops((all) => all.filter((s) => s.id !== stop.id))}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </CardTitle>
              {batch && index > 0 && <CardDescription>Priced from drop-off {index}.</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4">
              <SavedCustomerPicker customers={saved} selectedId={stop.savedId} onPick={(c) => pickSaved(stop, c)} onRemove={removeSaved} />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`rr-name-${stop.id}`}>Customer name*</Label>
                  <Input id={`rr-name-${stop.id}`} value={stop.name} onChange={(e) => update(stop.id, { name: e.target.value, savedId: null })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`rr-phone-${stop.id}`}>Customer phone*</Label>
                  <Input id={`rr-phone-${stop.id}`} type="tel" placeholder="e.g. 08012345678" value={stop.phone}
                    onChange={(e) => update(stop.id, { phone: e.target.value, savedId: null })} />
                  {stop.phone && !isValidPhone(stop.phone) && <p className="text-xs text-destructive">Enter a full phone number.</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`rr-email-${stop.id}`}>Customer email*</Label>
                <Input id={`rr-email-${stop.id}`} type="email" placeholder="e.g. ada@example.com" value={stop.email}
                  onChange={(e) => update(stop.id, { email: e.target.value })} />
                {stop.email && !isValidEmail(stop.email)
                  ? <p className="text-xs text-destructive">Enter a valid email address.</p>
                  : <p className="text-xs text-muted-foreground">We email them the delivery code to give the rider.</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Delivery location*</Label>
                <MapLocationPicker key={`${stop.id}-${stop.mapKey}`} value={stop.location} onChange={(l) => update(stop.id, { location: l, savedId: null })} />
                {stop.location && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">{addressHeadline(stop.location)}</p>
                    <p className="text-muted-foreground">{stop.location.formatted_address}</p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`rr-directions-${stop.id}`}>Directions for the rider (optional)</Label>
                <Textarea id={`rr-directions-${stop.id}`} placeholder="e.g. Block C, Room 205, or the shop beside the blue gate"
                  value={stop.directions} onChange={(e) => update(stop.id, { directions: e.target.value })} className="min-h-[60px]" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`rr-package-${stop.id}`}>What's being delivered (optional)</Label>
                <Textarea id={`rr-package-${stop.id}`} placeholder="e.g. 2 plates of jollof rice in a white bag"
                  value={stop.packageDetails} onChange={(e) => update(stop.id, { packageDetails: e.target.value })} className="min-h-[60px]" />
              </div>

              {!stop.savedId && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={stop.saveCustomer} onCheckedChange={(v) => update(stop.id, { saveCustomer: v === true })} />
                  Save this customer for next time
                </label>
              )}
            </CardContent>
          </Card>
        ))}

        {batch && (
          <Button variant="outline" className="w-full" disabled={stops.length >= maxStops} onClick={() => setStops((all) => [...all, newStop()])}>
            <Plus className="mr-1.5 h-4 w-4" />
            {stops.length >= maxStops ? `A batch can have up to ${maxStops} drop-offs` : 'Add another drop-off'}
          </Button>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Delivery mode and cost</CardTitle>
            <CardDescription>
              The delivery fee{batch ? ' for each drop-off' : ''} plus Cydex's commission on it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!allLocated ? (
              <p className="text-muted-foreground">Choose {batch ? 'every delivery location' : 'the delivery location'} to see the price.</p>
            ) : quoting && !quote ? (
              <div className="h-16 animate-pulse rounded bg-muted" />
            ) : quote ? (
              <>
                {quote.modes && quote.modes.length > 0 && (
                  <DeliveryModeSelect modes={quote.modes} value={chosenVehicle} onChange={setVehicle} disabled={submitting} />
                )}
                {problem && <Alert variant="destructive"><AlertDescription>{problem}</AlertDescription></Alert>}
                {quote.status === 'ok' && !batch && (
                  <CheckoutOffers
                    role="vendor"
                    thing="request"
                    promotionName={quote.promotion_name}
                    discount={quote.discount_amount}
                    usesLeft={quote.promotion_uses_left}
                    couponApplied={!!coupon && quote.coupon_status === 'applied'}
                    onUseCode={setCoupon}
                    vehicleType={chosenVehicle}
                    distanceKm={quote.distance_km}
                    modes={quote.modes}
                    onPickMode={setVehicle}
                    disabled={submitting}
                  />
                )}
                {quote.status === 'ok' && !batch && (
                  <CouponField
                    id="request-coupon"
                    thing="request"
                    coupon={coupon}
                    onChange={setCoupon}
                    status={quote.coupon_status}
                    promotionName={quote.promotion_name}
                    message={quote.coupon_message}
                    usesLeft={quote.promotion_uses_left}
                    checking={quoting}
                    disabled={submitting}
                  />
                )}
                {quote.status === 'ok' && batch && (
                  <p className="text-xs text-muted-foreground">Promotions and coupons apply to single requests, not batches.</p>
                )}
                {quote.status === 'ok' && (
                  <div className="space-y-1.5">
                    {batch ? quote.stops?.map((leg, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">Drop-off {i + 1} ({Number(leg.distance_km).toFixed(1)} km)</span>
                        <span>{formatNaira(Number(leg.delivery_fee))}</span>
                      </div>
                    )) : (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Delivery ({Number(quote.distance_km).toFixed(1)} km)</span>
                        <span>{formatNaira(Number(quote.delivery_fee))}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cydex commission</span>
                      <span>{formatNaira(Number(quote.commission))}</span>
                    </div>
                    {!batch && Number(quote.discount_amount) > 0 && (
                      <div className="flex justify-between text-green-700 dark:text-green-400">
                        <span className="min-w-0 truncate pr-2">Discount</span>
                        <span className="shrink-0">−{formatNaira(Number(quote.discount_amount))}</span>
                      </div>
                    )}
                    <Separator className="my-1" />
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span>{formatNaira(Number(quote.total_amount))}</span>
                    </div>
                    <div className="flex justify-between pt-2 text-muted-foreground">
                      <span>From your wallet (balance {formatNaira(Number(quote.wallet_balance))})</span>
                      <span>{formatNaira(Number(quote.wallet_amount))}</span>
                    </div>
                    {Number(quote.card_amount) > 0 && (
                      <div className="flex justify-between font-medium">
                        <span>Pay by card</span>
                        <span>{formatNaira(Number(quote.card_amount))}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => navigate('/vendor/rider-requests')} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {quote?.status === 'ok' && Number(quote.card_amount) > 0
              ? `Request rider and pay ${formatNaira(Number(quote.card_amount))}`
              : batch ? 'Request rider for the batch' : 'Request rider'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NewRiderRequest;
