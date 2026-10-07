import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import DocumentUpload from '@/components/onboarding/DocumentUpload';
import StoreImagesUpload from '@/components/vendor/settings/StoreImagesUpload';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useMyVerification } from '@/hooks/useMyVerification';
import { isValidPhone } from '@/lib/phone';
import { errorMessage } from '@/lib/address';

// Vendor onboarding: store name (what customers see), phone, logo and banner,
// business category, registered business (+ licence). With a licence the
// vendor waits for an admin; without one they start trading as unverified.
const VendorOnboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { verification } = useMyVerification();
  const [storeName, setStoreName] = useState('');
  const [phone, setPhone] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [registered, setRegistered] = useState<'yes' | 'no' | ''>('');
  const [licensePath, setLicensePath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Same query StoreImagesUpload refreshes after each upload
  const { data: profile } = useQuery({
    queryKey: ['store-images', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('avatar, store_banner_url, name').eq('id', user!.id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: phoneRow } = useQuery({
    queryKey: ['profile-phone', user?.id],
    enabled: !!user?.id,
    queryFn: async () => (await supabase.from('profiles').select('phone').eq('id', user!.id).single()).data,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['business-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('business_categories').select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Start from what they entered before (e.g. resubmitting after a rejection)
  useEffect(() => {
    if (prefilled || !profile || phoneRow === undefined) return;
    setStoreName(profile.name ?? '');
    setPhone(phoneRow?.phone && isValidPhone(phoneRow.phone) ? phoneRow.phone : '');
    if (verification) {
      setCategoryId(verification.business_category_id ?? '');
      setRegistered(verification.is_registered_business ? 'yes' : verification.is_registered_business === false ? 'no' : '');
      setLicensePath(verification.business_license_path);
    }
    setPrefilled(true);
  }, [profile, phoneRow, verification, prefilled]);

  const imagesReady = !!profile?.avatar && !!profile?.store_banner_url;
  const canSubmit =
    storeName.trim().length > 1 && isValidPhone(phone) && !!categoryId && !!registered && imagesReady &&
    (registered === 'no' || !!licensePath) && !submitting;

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: status, error } = await supabase.rpc('submit_vendor_onboarding', {
        p_store_name: storeName.trim(),
        p_phone: phone.trim(),
        p_category_id: categoryId,
        p_is_registered: registered === 'yes',
        p_license_path: registered === 'yes' ? licensePath ?? undefined : undefined,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['my-verification'] });
      queryClient.invalidateQueries({ queryKey: ['has-phone'] });
      if (status === 'unverified') {
        toast.success("You're all set. Your store is live as unverified.");
        navigate('/vendor', { replace: true });
      } else {
        navigate('/vendor/verification', { replace: true });
      }
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
          <h1 className="text-2xl font-bold">Set up your store</h1>
          <p className="text-sm text-muted-foreground">Tell us about your business. This is what customers will see.</p>
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
            <CardTitle className="text-base">Store details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="store-name">Store name*</Label>
              <Input id="store-name" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="e.g. Mama's Kitchen" />
              <p className="text-xs text-muted-foreground">Customers see this name.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-phone">Phone number*</Label>
              <Input id="store-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 08012345678" />
              {phone && !isValidPhone(phone) && <p className="text-xs text-destructive">Enter a full phone number.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Business category*</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Logo and banner*</CardTitle>
            <CardDescription>Shown on your store page and in customers' vendor lists.</CardDescription>
          </CardHeader>
          <CardContent>
            <StoreImagesUpload />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Registration</CardTitle>
            <CardDescription>
              Registered businesses can upload a licence to get the verified badge. Without one, you can start selling
              straight away as an unverified store.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Is this a registered business?*</Label>
              <RadioGroup value={registered} onValueChange={(v) => setRegistered(v as 'yes' | 'no')} className="flex gap-6">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="yes" /> Yes</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="no" /> No</label>
              </RadioGroup>
            </div>
            {registered === 'yes' && (
              <DocumentUpload kind="license" value={licensePath} onChange={setLicensePath} label="Business licence (CAC certificate)*" />
            )}
          </CardContent>
        </Card>

        <Button onClick={submit} disabled={!canSubmit} className="w-full" size="lg">
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {registered === 'yes' ? 'Submit for verification' : 'Finish setup'}
        </Button>
        {!imagesReady && <p className="text-center text-xs text-muted-foreground">Upload your logo and banner to continue.</p>}
      </div>
    </OnboardingLayout>
  );
};

export default VendorOnboarding;
