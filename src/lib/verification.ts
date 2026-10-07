import { supabase } from '@/integrations/supabase/client';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/lib/uploads';

// Vendor and rider verification (docs/VERIFICATION.md). The database decides
// who can trade; these mirror its rules for routing.
export type VerificationStatus = 'pending' | 'verified' | 'unverified' | 'rejected' | 'suspended';

export interface Verification {
  profile_id: string;
  role: 'vendor' | 'rider';
  status: VerificationStatus;
  access_while_pending: boolean;
  business_category_id: string | null;
  is_registered_business: boolean | null;
  business_license_path: string | null;
  vehicle_type: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  vehicle_registration: string | null;
  id_document_type: string | null;
  id_document_path: string | null;
  rejection_reason: string | null;
  suspension_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

// Where a vendor or rider belongs right now
export type Access = 'ok' | 'onboarding' | 'waiting' | 'rejected' | 'suspended';

export const accessFor = (role: 'vendor' | 'rider', v: Verification | null | undefined): Access => {
  if (!v) return 'onboarding';
  if (v.status === 'suspended') return 'suspended';
  if (v.status === 'rejected') return 'rejected';
  if (v.status === 'verified') return 'ok';
  if (role === 'vendor' && (v.status === 'unverified' || (v.status === 'pending' && v.access_while_pending))) return 'ok';
  return 'waiting';
};

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: 'Pending review',
  verified: 'Verified',
  unverified: 'Unverified',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

export const VEHICLE_TYPES = [
  { value: 'walking', label: 'On foot' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'electric_bike', label: 'Electric bike' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'car', label: 'Car' },
] as const;
export const MOTOR_VEHICLES = ['electric_bike', 'motorcycle', 'car'];

export const ID_TYPES = [
  { value: 'national_id', label: 'National ID (NIN slip or card)' },
  { value: 'passport', label: 'International passport' },
  { value: 'voters_card', label: "Voter's card" },
  { value: 'drivers_license', label: "Driver's licence" },
] as const;

export const DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

// Uploads a licence or ID into the private verification-docs bucket, under
// the user's own folder. Returns the storage path.
export const uploadVerificationDoc = async (userId: string, kind: 'license' | 'id', file: File) => {
  if (!DOC_TYPES.includes(file.type)) throw new Error('Upload a PDF, PNG, JPG or WebP file');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`Files must be ${MAX_UPLOAD_LABEL} or smaller`);
  const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('verification-docs').upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
};

// A short-lived link to view a document (owner or admin)
export const verificationDocUrl = async (path: string) => {
  const { data, error } = await supabase.storage.from('verification-docs').createSignedUrl(path, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl;
};
