import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { MapLocationPicker } from '@/components/address/AddressPickerDialog';
import VendorPhoneNotice from '@/components/vendor/VendorPhoneNotice';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useHasPhone } from '@/hooks/useHasPhone';
import { invokeFunction } from '@/lib/edgeFunctions';
import { addressHeadline, errorMessage } from '@/lib/address';
import { isValidPhone } from '@/lib/phone';
import { formatNaira } from '@/lib/pricing';
import type { PickedLocation } from '@/lib/googleMaps';
import { cn } from '@/lib/utils';

// A vendor asks for a rider to deliver an order their customer placed with
// them directly. They pay the delivery fee + 10% commission: wallet first,
// card for the rest (create_rider_request in the database).
const NewRiderRequest = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hasPhone = useHasPhone();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState<PickedLocation | null>(null);
  const [directions, setDirections] = useState('');
  const [packageDetails, setPackageDetails] = useState('');
  const [saveCustomer, setSaveCustomer] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const { data: saved = [] } = useQuery({
    queryKey: ['vendor-customers', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_customers')
        .select('*')
        .eq('vendor_id', user!.id)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: quote, isFetching: quoting } = useQuery({
    queryKey: ['rider-request-quote', location?.latitude, location?.longitude],
    enabled: !!location,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rider_request_quote', {
        p_latitude: location!.latitude,
        p_longitude: location!.longitude,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const pickSaved = (c: (typeof saved)[number]) => {
    setSavedId(c.id);
    setName(c.name);
    setPhone(c.phone);
    setDirections(c.directions ?? '');
    setLocation({
      place_name: c.place_name,
      formatted_address: c.formatted_address,
      street: c.street,
      city: c.city,
      state: c.state,
      country: c.country,
      place_id: c.place_id,
      latitude: c.latitude,
      longitude: c.longitude,
    });
    setMapKey((k) => k + 1);
  };

  const removeSaved = async (id: string) => {
    const { error } = await supabase.from('vendor_customers').delete().eq('id', id);
    if (error) {
      toast.error(errorMessage(error, 'Could not remove customer'));
      return;
    }
    if (savedId === id) setSavedId(null);
    queryClient.invalidateQueries({ queryKey: ['vendor-customers', user?.id] });
  };

  const problem =
    !quote ? null
      : quote.status === 'no_store' ? 'Set your store location in Settings first.'
        : quote.status === 'out_of_range' ? 'This location is more than 5 km from your store.'
          : null;
  const canSubmit =
    hasPhone && name.trim().length > 0 && isValidPhone(phone) && !!location && quote?.status === 'ok' && !submitting;

  const submit = async () => {
    if (!location || !canSubmit) return;
    setSubmitting(true);
    try {
      const { data: order, error } = await supabase.rpc('create_rider_request', {
        p_recipient_name: name.trim(),
        p_recipient_phone: phone.trim(),
        p_location: { ...location, directions: directions.trim() || null },
        p_package_details: packageDetails.trim() || undefined,
        p_save_customer: saveCustomer && !savedId,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['rider-requests'] });

      if (order.status === 'ready_for_pickup') {
        toast.success('Paid from your wallet. Nearby riders have been notified.');
        navigate(`/vendor/rider-requests/${order.id}`);
        return;
      }

      // Pay the rest by card; Squad brings them back to the request page
      try {
        const { checkout_url } = await invokeFunction<{ checkout_url: string }>('squad-checkout', {
          action: 'initiate',
          order_number: order.order_number,
        });
        window.location.href = checkout_url;
      } catch (e) {
        toast.error(errorMessage(e, 'Could not start the card payment. You can pay from the request page.'));
        navigate(`/vendor/rider-requests/${order.id}`);
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
            A rider collects the package from your store and delivers it to your customer.
          </p>
        </div>

        {!hasPhone && <VendorPhoneNotice />}

        {saved.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Saved customers</CardTitle>
              <CardDescription>Pick one to fill in their details.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {saved.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border p-2',
                    savedId === c.id && 'border-primary bg-primary/5',
                  )}
                >
                  <button type="button" onClick={() => pickSaved(c)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                    <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-medium">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">{c.phone}</span>
                      <span className="block break-words text-xs text-muted-foreground">{c.formatted_address}</span>
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => removeSaved(c.id)}
                    aria-label={`Remove ${c.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customer and delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rr-name">Customer name*</Label>
                <Input id="rr-name" value={name} onChange={(e) => { setName(e.target.value); setSavedId(null); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rr-phone">Customer phone*</Label>
                <Input
                  id="rr-phone"
                  type="tel"
                  placeholder="e.g. 08012345678"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setSavedId(null); }}
                />
                {phone && !isValidPhone(phone) && <p className="text-xs text-destructive">Enter a full phone number.</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Delivery location*</Label>
              <MapLocationPicker key={mapKey} value={location} onChange={(l) => { setLocation(l); setSavedId(null); }} />
              {location && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <p className="font-medium">{addressHeadline(location)}</p>
                  <p className="text-muted-foreground">{location.formatted_address}</p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rr-directions">Directions for the rider (optional)</Label>
              <Textarea
                id="rr-directions"
                placeholder="e.g. Block C, Room 205, or the shop beside the blue gate"
                value={directions}
                onChange={(e) => setDirections(e.target.value)}
                className="min-h-[60px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rr-package">What's being delivered (optional)</Label>
              <Textarea
                id="rr-package"
                placeholder="e.g. 2 plates of jollof rice in a white bag"
                value={packageDetails}
                onChange={(e) => setPackageDetails(e.target.value)}
                className="min-h-[60px]"
              />
            </div>

            {!savedId && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={saveCustomer} onCheckedChange={(v) => setSaveCustomer(v === true)} />
                Save this customer for next time
              </label>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cost</CardTitle>
            <CardDescription>The delivery fee plus Cydex's 10% commission on it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {!location ? (
              <p className="text-muted-foreground">Choose the delivery location to see the price.</p>
            ) : quoting && !quote ? (
              <div className="h-16 animate-pulse rounded bg-muted" />
            ) : problem ? (
              <p className="text-destructive">{problem}</p>
            ) : quote ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery ({Number(quote.distance_km).toFixed(1)} km)</span>
                  <span>{formatNaira(Number(quote.delivery_fee))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cydex commission</span>
                  <span>{formatNaira(Number(quote.commission))}</span>
                </div>
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
            {quote && Number(quote.card_amount) > 0
              ? `Request rider and pay ${formatNaira(Number(quote.card_amount))}`
              : 'Request rider'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NewRiderRequest;
