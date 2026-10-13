import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import DocumentUpload from '@/components/onboarding/DocumentUpload';
import SingleAddressField from '@/components/address/SingleAddressField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useAddresses } from '@/hooks/useAddresses';
import { useMyVerification } from '@/hooks/useMyVerification';
import { ID_TYPES } from '@/lib/verification';
import { useVehicleTypes } from '@/hooks/useVehicleTypes';
import { isValidPhone } from '@/lib/phone';
import { errorMessage } from '@/lib/address';

// Rider onboarding: phone, address, vehicle (type from the admin's list; its
// colour, photo and registration where that type needs them) and a government
// ID. Riders wait for an admin to verify them before they can use the dashboard.
const RiderOnboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { verification } = useMyVerification();
  const { defaultAddress } = useAddresses();
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [color, setColor] = useState('');
  const [vehiclePhoto, setVehiclePhoto] = useState<string | null>(null);
  const [registration, setRegistration] = useState('');
  const [registrationDoc, setRegistrationDoc] = useState<string | null>(null);
  const { types: vehicleTypes, byKey } = useVehicleTypes(true);
  const [idType, setIdType] = useState('');
  const [idPath, setIdPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  const { data: phoneRow } = useQuery({
    queryKey: ['profile-phone', user?.id],
    enabled: !!user?.id,
    queryFn: async () => (await supabase.from('profiles').select('phone').eq('id', user!.id).single()).data,
  });

  useEffect(() => {
    if (prefilled || phoneRow === undefined) return;
    setPhone(phoneRow?.phone && isValidPhone(phoneRow.phone) ? phoneRow.phone : '');
    if (verification) {
      setVehicleType(verification.vehicle_type ?? '');
      setColor(verification.vehicle_color ?? '');
      setVehiclePhoto(verification.vehicle_photo_path);
      setRegistration(verification.vehicle_registration ?? '');
      setRegistrationDoc(verification.vehicle_registration_doc_path);
      setIdType(verification.id_document_type ?? '');
      setIdPath(verification.id_document_path);
    }
    setPrefilled(true);
  }, [phoneRow, verification, prefilled]);

  const type = byKey(vehicleType);
  const needsDetails = !!type?.needs_details;
  const needsRegistration = !!type?.needs_registration;
  // Types that are switched off stay available only to riders who already have them
  const choices = vehicleTypes.filter((t) => t.is_active || t.key === verification?.vehicle_type);
  const canSubmit =
    isValidPhone(phone) && !!defaultAddress && !!type &&
    (!needsDetails || (!!color.trim() && !!vehiclePhoto)) &&
    (!needsRegistration || (!!registration.trim() && !!registrationDoc)) &&
    !!idType && !!idPath && !submitting;

  const submit = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('submit_rider_onboarding', {
        p_phone: phone.trim(),
        p_vehicle_type: vehicleType,
        // null (not left out) when the vehicle type doesn't need them
        p_vehicle_color: needsDetails ? color.trim() : null,
        p_vehicle_photo_path: needsDetails ? vehiclePhoto ?? null : null,
        p_vehicle_registration: needsRegistration ? registration.trim() : null,
        p_registration_doc_path: needsRegistration ? registrationDoc ?? null : null,
        p_id_document_type: idType,
        p_id_document_path: idPath!,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['my-verification'] });
      queryClient.invalidateQueries({ queryKey: ['has-phone'] });
      navigate('/rider/verification', { replace: true });
    } catch (e) {
      toast.error(errorMessage(e, 'Could not submit'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Become a Cydex rider</h1>
          <p className="text-sm text-muted-foreground">We check every rider before their first delivery. This takes a few minutes.</p>
        </div>

        {verification?.status === 'verified' && (
          <Alert className="border-amber-500/40 bg-amber-500/10">
            <AlertDescription className="space-y-2">
              <p>
                You're verified. Submitting changes sends your account back to Cydex for review, and{' '}
                <strong>you won't have access to your dashboard until it's approved again</strong> (you can't take deliveries meanwhile).
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate('/rider/profile')}>Keep my current details</Button>
            </AlertDescription>
          </Alert>
        )}

        {verification?.status === 'rejected' && verification.rejection_reason && (
          <Alert variant="destructive">
            <AlertDescription>
              Your last submission wasn't approved: {verification.rejection_reason}. Update your details and submit again.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contact and address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rider-phone">Phone number*</Label>
              <Input id="rider-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 08012345678" />
              {phone && !isValidPhone(phone) && <p className="text-xs text-destructive">Enter a full phone number.</p>}
            </div>
            <SingleAddressField
              label="Home address*"
              addressLabel="Home"
              pickerTitle="Your address"
              pickerDescription="Search for your address, then drag the map so the pin sits exactly on it."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vehicle</CardTitle>
            <CardDescription>How you'll make deliveries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Type*</Label>
              <Select value={vehicleType} onValueChange={setVehicleType}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {choices.map((v) => <SelectItem key={v.key} value={v.key}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {needsDetails && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="v-color">Colour*</Label>
                  <Input id="v-color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. Red" />
                </div>
                <DocumentUpload kind="vehicle" value={vehiclePhoto} onChange={setVehiclePhoto} label="Photo of your vehicle*" />
              </>
            )}
            {needsRegistration && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="v-reg">Registration number*</Label>
                  <Input id="v-reg" value={registration} onChange={(e) => setRegistration(e.target.value)} placeholder="e.g. LSD-123-AB" />
                </div>
                <DocumentUpload kind="registration" value={registrationDoc} onChange={setRegistrationDoc} label="Vehicle registration document*" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Government ID</CardTitle>
            <CardDescription>Only Cydex admins can see this document.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>ID type*</Label>
              <Select value={idType} onValueChange={setIdType}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {ID_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DocumentUpload kind="id" value={idPath} onChange={setIdPath} label="Photo or scan of the ID*" />
          </CardContent>
        </Card>

        <Button onClick={submit} disabled={!canSubmit} className="w-full" size="lg">
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit for verification
        </Button>
        {!defaultAddress && <p className="text-center text-xs text-muted-foreground">Add your home address to continue.</p>}
      </div>
    </OnboardingLayout>
  );
};

export default RiderOnboarding;
