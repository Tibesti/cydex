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
import { ID_TYPES, MOTOR_VEHICLES, VEHICLE_TYPES } from '@/lib/verification';
import { isValidPhone } from '@/lib/phone';
import { errorMessage } from '@/lib/address';

const THIS_YEAR = new Date().getFullYear();

// Rider onboarding: phone, address, vehicle and a government ID. Riders wait
// for an admin to verify them before they can use the dashboard.
const RiderOnboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { verification } = useMyVerification();
  const { defaultAddress } = useAddresses();
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [registration, setRegistration] = useState('');
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
      setModel(verification.vehicle_model ?? '');
      setYear(verification.vehicle_year ? String(verification.vehicle_year) : '');
      setColor(verification.vehicle_color ?? '');
      setRegistration(verification.vehicle_registration ?? '');
      setIdType(verification.id_document_type ?? '');
      setIdPath(verification.id_document_path);
    }
    setPrefilled(true);
  }, [phoneRow, verification, prefilled]);

  const motorised = MOTOR_VEHICLES.includes(vehicleType);
  const yearNum = Number(year);
  const yearOk = !motorised || (Number.isInteger(yearNum) && yearNum >= 1980 && yearNum <= THIS_YEAR + 1);
  const canSubmit =
    isValidPhone(phone) && !!defaultAddress && !!vehicleType &&
    (!motorised || (model.trim() && color.trim() && yearOk)) && !!idType && !!idPath && !submitting;

  const submit = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('submit_rider_onboarding', {
        p_phone: phone.trim(),
        p_vehicle_type: vehicleType,
        p_vehicle_model: motorised ? model.trim() : null,
        p_vehicle_year: motorised ? yearNum : null,
        p_vehicle_color: motorised ? color.trim() : null,
        p_vehicle_registration: registration.trim() || null,
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
                  {VEHICLE_TYPES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {motorised && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="v-model">Model*</Label>
                  <Input id="v-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Bajaj Boxer" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v-year">Year*</Label>
                  <Input id="v-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 2021" />
                  {year && !yearOk && <p className="text-xs text-destructive">Enter a valid year.</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v-color">Colour*</Label>
                  <Input id="v-color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. Red" />
                </div>
              </div>
            )}
            {vehicleType && vehicleType !== 'walking' && (
              <div className="space-y-1.5">
                <Label htmlFor="v-reg">Registration number (if it has one)</Label>
                <Input id="v-reg" value={registration} onChange={(e) => setRegistration(e.target.value)} placeholder="e.g. LSD-123-AB" />
              </div>
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
