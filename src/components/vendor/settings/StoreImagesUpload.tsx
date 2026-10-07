import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ImageIcon, Loader2, Store } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { errorMessage } from '@/lib/address';
import { checkUploadSize, MAX_UPLOAD_LABEL } from '@/lib/uploads';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type Kind = 'logo' | 'banner';

// The vendor's store logo (square; it's also their profile photo) and banner,
// shown on their store page and cards. Files go to the public "store-images"
// bucket under the vendor's own folder.
const StoreImagesUpload = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<Kind | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const { data: images } = useQuery({
    queryKey: ['store-images', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('avatar, store_banner_url, name').eq('id', user!.id).single();
      if (error) throw error;
      return data;
    },
  });

  const upload = async (kind: Kind, file?: File) => {
    if (!file || !user?.id) return;
    if (!TYPES.includes(file.type)) {
      toast.error('Use a PNG, JPG or WebP image');
      return;
    }
    if (!checkUploadSize(file)) return;

    setUploading(kind);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('store-images').upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
      });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('store-images').getPublicUrl(path);
      const { error: updateError } = await supabase
        .from('profiles')
        .update(kind === 'logo' ? { avatar: publicUrl } : { store_banner_url: publicUrl })
        .eq('id', user.id);
      if (updateError) throw updateError;

      toast.success(kind === 'logo' ? 'Logo updated' : 'Banner updated');
      queryClient.invalidateQueries({ queryKey: ['store-images', user.id] });
    } catch (e) {
      toast.error(errorMessage(e, 'Upload failed'));
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Banner */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Store banner</p>
        <div className="relative h-24 w-full overflow-hidden rounded-lg border bg-muted sm:h-28">
          {images?.store_banner_url ? (
            <img src={images.store_banner_url} alt="Store banner" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" className="w-full text-xs sm:text-sm" disabled={!!uploading} onClick={() => bannerInput.current?.click()}>
          {uploading === 'banner' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          {images?.store_banner_url ? 'Change banner' : 'Upload banner'}
        </Button>
        <p className="text-xs text-muted-foreground">Wide image, e.g. 1200 × 400. PNG, JPG or WebP, up to {MAX_UPLOAD_LABEL}.</p>
        <input ref={bannerInput} type="file" accept={TYPES.join(',')} className="hidden"
          onChange={(e) => { upload('banner', e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {/* Logo */}
      <div className="flex flex-col items-center gap-2">
        <p className="self-start text-sm font-medium">Store logo</p>
        <div className="h-24 w-24 overflow-hidden rounded-xl border bg-muted sm:h-28 sm:w-28">
          {images?.avatar ? (
            <img src={images.avatar} alt="Store logo" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Store className="h-8 w-8" />
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" className="w-full text-xs sm:text-sm" disabled={!!uploading} onClick={() => logoInput.current?.click()}>
          {uploading === 'logo' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
          {images?.avatar ? 'Change logo' : 'Upload logo'}
        </Button>
        <p className="text-xs text-muted-foreground">Square works best (it's shown in a square). Also used as your profile photo.</p>
        <input ref={logoInput} type="file" accept={TYPES.join(',')} className="hidden"
          onChange={(e) => { upload('logo', e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    </div>
  );
};

export default StoreImagesUpload;
