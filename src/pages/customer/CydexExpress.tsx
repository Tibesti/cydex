import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock, Loader2, MapPin, Send } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MapLocationPicker } from '@/components/address/AddressPickerDialog';
import { AddressLabelIcon } from '@/components/address/AddressLabelIcon';
import CouponField from '@/components/delivery/CouponField';
import CheckoutOffers from '@/components/promotions/CheckoutOffers';
import { MY_PROMOTIONS_KEY } from '@/hooks/useMyPromotions';
import DeliveryModeSelect from '@/components/delivery/DeliveryModeSelect';
import { PriceBreakdown } from '@/components/customer/PriceBreakdown';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useAddresses, type Address } from '@/hooks/useAddresses';
import { useHasPhone } from '@/hooks/useHasPhone';
import { useVehicleTypes } from '@/hooks/useVehicleTypes';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { errorMessage } from '@/lib/address';
import { etaText, NO_RIDERS_MESSAGE, type DeliveryMode } from '@/lib/deliveryModes';
import { invokeFunction } from '@/lib/edgeFunctions';
import type { PickedLocation } from '@/lib/googleMaps';
import { isValidEmail, isValidPhone } from '@/lib/phone';
import { formatNaira } from '@/lib/pricing';

interface ExpressQuote {
  status: 'ok' | 'no_location' | 'out_of_range';
  distance_km: number | null;
  vehicle_type: string | null;
  delivery_fee: number | null;
  service_charge: number | null;
  discount_amount: number;
  promotion_name: string | null;
  coupon_status: 'none' | 'applied' | 'invalid';
  coupon_message?: string | null;
  promotion_uses_left?: number | null;
  total_amount: number | null;
  wallet_balance: number;
  wallet_amount: number;
  card_amount: number;
  riders_available: boolean;
  modes: DeliveryMode[];
  eta_min: number | null;
}

type Point = { location: PickedLocation | null; directions: string; mapKey: number };
const emptyPoint: Point = { location: null, directions: '', mapKey: 0 };

// A map picker with the customer's saved addresses as shortcuts
const PointPicker = ({
  point, onChange, addresses, directionsLabel, directionsPlaceholder, id,
}: {
  point: Point;
  onChange: (next: Point) => void;
  addresses: Address[];
  directionsLabel: string;
  directionsPlaceholder: string;
  id: string;
}) => (
  <div className="space-y-3">
    {addresses.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {addresses.map((a) => (
          <Button
            key={a.id}
            type="button"
            size="sm"
            variant={point.location?.place_id && point.location.place_id === a.place_id ? 'default' : 'outline'}
            className="h-8 gap-1.5 text-xs"
            onClick={() => onChange({ location: a, directions: a.directions ?? '', mapKey: point.mapKey + 1 })}
          >
            <AddressLabelIcon label={a.label} className="h-3.5 w-3.5" />
            {a.label}
          </Button>
        ))}
      </div>
    )}
    <MapLocationPicker key={point.mapKey} value={point.location} onChange={(l) => onChange({ ...point, location: l })} />
    {point.location && (
      <p className="flex items-start gap-1.5 text-sm">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="break-words">{point.location.formatted_address}</span>
      </p>
    )}
    <div className="space-y-1.5">
      <Label htmlFor={id}>{directionsLabel}</Label>
      <Input id={id} value={point.directions} onChange={(e) => onChange({ ...point, directions: e.target.value })} placeholder={directionsPlaceholder} maxLength={200} />
    </div>
  </div>
);

const asLocation = (p: Point) => ({ ...p.location, directions: p.directions.trim() || null }) as unknown as Json;

// Cydex Express: send your own item from one place to another. A rider collects
// it from you (they show a pickup code you enter) and hands it over at the
// drop-off for the delivery code, which the recipient also gets by email.
const CydexExpress = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { addresses } = useAddresses();
  const hasPhone = useHasPhone();
  const { maxTripText } = useVehicleTypes();

  const [pickup, setPickup] = useState<Point>(emptyPoint);
  const [dropoff, setDropoff] = useState<Point>(emptyPoint);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [mode, setMode] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const located = !!pickup.location && !!dropoff.location;
  const { data: quote, isLoading: quoteLoading, isFetching } = useQuery({
    queryKey: ['express-quote', pickup.location?.latitude, pickup.location?.longitude,
      dropoff.location?.latitude, dropoff.location?.longitude, mode, coupon],
    enabled: located,
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('express_quote', {
        p_pickup: pickup.location as unknown as Json,
        p_dropoff: dropoff.location as unknown as Json,
        p_vehicle_type: mode ?? undefined,
        p_coupon_code: coupon ?? undefined,
      });
      if (error) throw error;
      return data as unknown as ExpressQuote;
    },
  });

  const priced = located && quote?.status === 'ok';
  const noRiders = priced && !quote.riders_available;
  const couponApplied = !!coupon && quote?.coupon_status === 'applied';
  const emailOk = isValidEmail(email);
  const phoneOk = isValidPhone(phone);
  const formReady = name.trim().length > 1 && phoneOk && emailOk && details.trim().length > 2;
  const canSubmit = hasPhone && priced && !noRiders && formReady && !submitting && !isFetching;

  const submit = async () => {
    if (!canSubmit || !quote) return;
    const total = formatNaira(Number(quote.total_amount));
    if (!(await confirm({
      title: `Are you sure you want to book this delivery for ${total}?`,
      description: quote.card_amount > 0
        ? quote.wallet_amount > 0
          ? `${formatNaira(quote.wallet_amount)} comes from your wallet and you pay ${formatNaira(quote.card_amount)} by card or transfer. We'll email the delivery code to ${email.trim()}.`
          : `You'll pay by card or transfer next. We'll email the delivery code to ${email.trim()}.`
        : `It will be paid from your wallet. We'll email the delivery code to ${email.trim()}.`,
      confirmLabel: 'Yes, book it',
    }))) return;

    setSubmitting(true);
    try {
      const { data: order, error } = await supabase.rpc('create_express_order', {
        p_pickup: asLocation(pickup),
        p_dropoff: asLocation(dropoff),
        p_recipient_name: name.trim(),
        p_recipient_phone: phone.trim(),
        p_recipient_email: email.trim(),
        p_package_details: details.trim(),
        p_vehicle_type: mode ? quote.vehicle_type ?? undefined : undefined,
        p_coupon_code: couponApplied ? coupon! : undefined,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: [MY_PROMOTIONS_KEY] });

      if (order.payment_status === 'paid') {
        toast.success('Delivery booked and paid from your wallet. We’re finding you a rider.');
        navigate(`/customer/orders/${order.id}`);
        return;
      }
      // The card pays what the wallet didn't cover; Squad returns to the order page
      try {
        const { checkout_url } = await invokeFunction<{ checkout_url: string }>('squad-checkout', {
          action: 'initiate', order_number: order.order_number,
        });
        window.location.href = checkout_url;
      } catch (e) {
        toast.error(errorMessage(e, 'Could not start the payment. You can pay from the delivery page.'));
        navigate(`/customer/orders/${order.id}`);
      }
    } catch (e) {
      toast.error(errorMessage(e, 'Could not book the delivery'));
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout userRole="CUSTOMER">
      <div className="mx-auto max-w-3xl space-y-4 p-2 sm:p-4 md:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Send className="h-5 w-5 sm:h-6 sm:w-6" /> Cydex Express
          </h1>
          <p className="text-sm text-muted-foreground">
            Send an item from one place to another. A rider collects it and delivers it for you, and you can track it
            in your orders.
          </p>
        </div>

        {!hasPhone && (
          <Alert variant="destructive">
            <AlertDescription>
              Add a phone number to your profile first, so the rider can reach you at pickup.{' '}
              <Link to="/customer/profile" className="font-medium underline">Go to profile</Link>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1. Where should the rider collect it?</CardTitle>
            <CardDescription>Pick one of your saved addresses or find the place on the map.</CardDescription>
          </CardHeader>
          <CardContent>
            <PointPicker
              id="express-pickup-directions"
              point={pickup}
              onChange={setPickup}
              addresses={addresses}
              directionsLabel="Directions for the rider (optional)"
              directionsPlaceholder="e.g. Blue gate, ask for me at the reception"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2. Where is it going?</CardTitle>
            <CardDescription>Up to {maxTripText} from the pickup point.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PointPicker
              id="express-dropoff-directions"
              point={dropoff}
              onChange={setDropoff}
              addresses={addresses}
              directionsLabel="Directions to the drop-off (optional)"
              directionsPlaceholder="e.g. Second floor, flat 4"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="express-name">Recipient's name</Label>
                <Input id="express-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="express-phone">Recipient's phone</Label>
                <Input id="express-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080…" autoComplete="off" />
                {phone && !phoneOk && <p className="text-xs text-destructive">Enter a valid phone number.</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="express-email">Recipient's email</Label>
                <Input id="express-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" />
                {email && !emailOk ? (
                  <p className="text-xs text-destructive">Enter a valid email address.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">We email them the delivery code to give the rider. You'll see it too.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3. What are you sending?</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="e.g. A small box of documents. Fragile, keep upright."
              rows={3}
              maxLength={500}
              aria-label="What you're sending"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">4. Delivery and payment</CardTitle>
            {!located && <CardDescription>Choose the pickup and drop-off to see the price.</CardDescription>}
          </CardHeader>
          {located && (
            <CardContent className="space-y-4">
              {quoteLoading && !quote ? (
                <div className="h-24 animate-pulse rounded bg-muted" />
              ) : quote?.status === 'out_of_range' ? (
                <Alert variant="destructive">
                  <AlertDescription>The drop-off is more than {maxTripText} from the pickup point, which is further than we deliver. Choose a closer place.</AlertDescription>
                </Alert>
              ) : noRiders ? (
                <Alert variant="destructive">
                  <AlertDescription className="font-medium">{NO_RIDERS_MESSAGE}</AlertDescription>
                </Alert>
              ) : priced ? (
                <>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="truncate">{pickup.location?.place_name || pickup.location?.formatted_address.split(',')[0]}</span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                    <span className="truncate">{dropoff.location?.place_name || dropoff.location?.formatted_address.split(',')[0]}</span>
                    <span className="shrink-0">· {Number(quote.distance_km).toFixed(1)} km</span>
                  </p>

                  <DeliveryModeSelect id="express-mode" modes={quote.modes} value={quote.vehicle_type} onChange={setMode} disabled={submitting} />

                  {!!quote.eta_min && (
                    <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <p>
                        <span className="font-medium">Estimated delivery time: {etaText(quote.eta_min).toLowerCase()}</span>{' '}
                        <span className="text-muted-foreground">once the rider has your item.</span>
                      </p>
                    </div>
                  )}

                  <CheckoutOffers
                    role="customer"
                    thing="delivery"
                    promotionName={quote.promotion_name}
                    discount={quote.discount_amount}
                    usesLeft={quote.promotion_uses_left}
                    couponApplied={couponApplied}
                    // Items offers are for orders from a business, not Express
                    fits={(o) => o.applies_to !== 'items'}
                    onUseCode={setCoupon}
                    vehicleType={quote.vehicle_type}
                    distanceKm={quote.distance_km}
                    modes={quote.modes}
                    onPickMode={setMode}
                    disabled={submitting}
                  />

                  <CouponField
                    id="express-coupon"
                    thing="delivery"
                    coupon={coupon}
                    onChange={setCoupon}
                    status={quote.coupon_status}
                    promotionName={quote.promotion_name}
                    message={quote.coupon_message}
                    usesLeft={quote.promotion_uses_left}
                    checking={isFetching}
                    disabled={submitting}
                  />

                  <div className="rounded-md border p-3">
                    <PriceBreakdown
                      deliveryFee={quote.delivery_fee}
                      serviceCharge={quote.service_charge}
                      discount={quote.discount_amount}
                      discountLabel={quote.promotion_name}
                      total={quote.total_amount}
                      walletAmount={quote.wallet_amount}
                      cardAmount={quote.card_amount}
                    />
                  </div>
                </>
              ) : null}

              <Button size="lg" className="w-full text-black" onClick={submit} disabled={!canSubmit}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {priced && !noRiders
                  ? quote.card_amount > 0
                    ? `Book and pay ${formatNaira(quote.card_amount)}`
                    : `Book and pay ${formatNaira(Number(quote.total_amount))} from wallet`
                  : 'Book delivery'}
              </Button>
              {priced && !noRiders && !formReady && (
                <p className="text-center text-xs text-muted-foreground">
                  Fill in the recipient's name, phone and email, and what you're sending.
                </p>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CydexExpress;
