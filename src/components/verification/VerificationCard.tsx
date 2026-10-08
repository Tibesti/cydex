import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ExternalLink, FileText, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/contexts/ConfirmContext';
import { useMyVerification } from '@/hooks/useMyVerification';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { cn } from '@/lib/utils';
import {
  ID_TYPES, MOTOR_VEHICLES, STATUS_LABELS, VEHICLE_TYPES, verificationDocUrl, type VerificationStatus,
} from '@/lib/verification';

const STATUS_CLASS: Record<VerificationStatus, string> = {
  verified: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  unverified: 'bg-muted text-muted-foreground',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  suspended: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium text-foreground">{children}</span>
  </div>
);

// The vendor's or rider's verification details and documents, with a way to
// update them (which sends the account back for review)
const VerificationCard = ({ role }: { role: 'vendor' | 'rider' }) => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { verification: v, loading } = useMyVerification();

  const { data: categoryName } = useQuery({
    queryKey: ['business-category-name', v?.business_category_id],
    enabled: role === 'vendor' && !!v?.business_category_id,
    queryFn: async () => {
      const { data } = await supabase.from('business_categories').select('name').eq('id', v!.business_category_id!).maybeSingle();
      return data?.name ?? null;
    },
  });

  const openDoc = async (path: string) => {
    try {
      window.open(await verificationDocUrl(path), '_blank', 'noopener');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not open the document'));
    }
  };

  const update = async () => {
    if (!v) return navigate(`/${role}/onboarding`);
    const verified = v.status === 'verified';
    const ok = await confirm({
      title: 'Are you sure you want to update your verification details?',
      description: verified ? (
        <span>
          Your account goes back to Cydex for review once you submit.{' '}
          <strong className="text-foreground">
            You won't have access to your dashboard until it's approved again
          </strong>
          {role === 'vendor' ? ': you can’t take orders in the meantime.' : ': you can’t take deliveries in the meantime.'}
        </span>
      ) : 'Your updated details go to Cydex for review.',
      confirmLabel: 'Yes, update',
      destructive: verified,
    });
    if (ok) navigate(`/${role}/onboarding`);
  };

  if (loading) return <Card><CardContent className="p-6"><div className="h-32 animate-pulse rounded bg-muted" /></CardContent></Card>;

  const docPath = role === 'vendor' ? v?.business_license_path : v?.id_document_path;
  const vehicle = VEHICLE_TYPES.find((t) => t.value === v?.vehicle_type)?.label ?? v?.vehicle_type;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Verification</span>
          {v && (
            <Badge variant="outline" className={cn('border-transparent', STATUS_CLASS[v.status])}>{STATUS_LABELS[v.status]}</Badge>
          )}
        </CardTitle>
        {v?.reviewed_at && v.status === 'verified' && (
          <CardDescription>Approved {format(new Date(v.reviewed_at), 'd MMM yyyy')}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!v ? (
          <p className="text-sm text-muted-foreground">You haven't submitted your verification details yet.</p>
        ) : (
          <>
            {v.status === 'pending' && (
              <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
                {role === 'vendor' && v.access_while_pending
                  ? 'Your licence is being reviewed. You can keep selling meanwhile.'
                  : 'Cydex is reviewing your details. We’ll let you know by email and notification.'}
              </p>
            )}
            {v.status === 'unverified' && role === 'vendor' && (
              <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">
                Upload your business licence to get the verified badge customers look for.
              </p>
            )}
            {v.status === 'rejected' && v.rejection_reason && (
              <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">Not approved: {v.rejection_reason}</p>
            )}
            {v.status === 'suspended' && v.suspension_reason && (
              <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">Suspended: {v.suspension_reason}</p>
            )}
            <div className="divide-y">
              {role === 'vendor' ? (
                <>
                  <Row label="Business category">{categoryName ?? '–'}</Row>
                  <Row label="Registered business">{v.is_registered_business ? 'Yes' : 'No'}</Row>
                </>
              ) : (
                <>
                  <Row label="How you deliver">{vehicle ?? '–'}</Row>
                  {v.vehicle_type && MOTOR_VEHICLES.includes(v.vehicle_type) && (
                    <Row label="Vehicle">
                      {[v.vehicle_model, v.vehicle_year, v.vehicle_color].filter(Boolean).join(' · ') || '–'}
                    </Row>
                  )}
                  {v.vehicle_registration && <Row label="Registration">{v.vehicle_registration}</Row>}
                  <Row label="ID type">{ID_TYPES.find((t) => t.value === v.id_document_type)?.label ?? '–'}</Row>
                </>
              )}
              <Row label={role === 'vendor' ? 'Business licence' : 'ID document'}>
                {docPath ? (
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => openDoc(docPath)}>
                    <FileText className="mr-1 h-3.5 w-3.5" /> View <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                ) : (
                  <span className="text-muted-foreground">Not uploaded</span>
                )}
              </Row>
            </div>
          </>
        )}

        {v?.status !== 'suspended' && (
          <Button variant="outline" className="w-full" onClick={update}>
            {!v ? 'Complete verification'
              : role === 'vendor' && !v.business_license_path ? 'Add business licence'
                : 'Update verification details'}
          </Button>
        )}
        {v?.status === 'verified' && (
          <p className="text-xs text-muted-foreground">
            Changing these sends your account back for review, and you won't have access to your dashboard until it's approved again.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default VerificationCard;
