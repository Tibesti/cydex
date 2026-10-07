import { toast } from 'sonner';

// One file size limit for every upload in the app (also set on the
// "store-images" storage bucket)
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = '5 MB';

// False (with a message) when the file is over the limit
export const checkUploadSize = (file: File): boolean => {
  if (file.size > MAX_UPLOAD_BYTES) {
    toast.error(`Files must be ${MAX_UPLOAD_LABEL} or smaller`);
    return false;
  }
  return true;
};

// For plain file inputs: clears the selection if the file is too big
export const rejectOversizedFile = (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (file && !checkUploadSize(file)) event.target.value = '';
};
