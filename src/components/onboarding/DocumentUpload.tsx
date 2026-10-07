import { useRef, useState } from 'react';
import { FileCheck2, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { DOC_TYPES, uploadVerificationDoc, verificationDocUrl } from '@/lib/verification';
import { MAX_UPLOAD_LABEL } from '@/lib/uploads';
import { errorMessage } from '@/lib/address';

interface DocumentUploadProps {
  kind: 'license' | 'id';
  /** Storage path of the uploaded file, if any */
  value: string | null;
  onChange: (path: string) => void;
  label: string;
}

// Uploads a licence or ID document to the private verification bucket
const DocumentUpload = ({ kind, value, onChange, label }: DocumentUploadProps) => {
  const { user } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const upload = async (file?: File) => {
    if (!file || !user?.id) return;
    setUploading(true);
    try {
      onChange(await uploadVerificationDoc(user.id, kind, file));
      setFileName(file.name);
    } catch (e) {
      toast.error(errorMessage(e, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const view = async () => {
    if (!value) return;
    try {
      window.open(await verificationDocUrl(value), '_blank', 'noopener');
    } catch (e) {
      toast.error(errorMessage(e, 'Could not open the file'));
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center">
        {value ? (
          <button type="button" onClick={view} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm hover:underline">
            <FileCheck2 className="h-5 w-5 shrink-0 text-green-600" />
            <span className="truncate">{fileName ?? 'Document uploaded'}</span>
          </button>
        ) : (
          <p className="flex-1 text-sm text-muted-foreground">PDF, PNG, JPG or WebP, up to {MAX_UPLOAD_LABEL}.</p>
        )}
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {value ? 'Replace' : 'Upload'}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept={DOC_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
};

export default DocumentUpload;
