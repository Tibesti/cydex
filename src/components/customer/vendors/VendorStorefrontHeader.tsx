import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MapPin, ShoppingCart, Star, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useAddresses } from '@/hooks/useAddresses';
import { formatKm } from '@/lib/riderLocation';
import { VendorRatingModal } from '@/components/customer/VendorRatingModal';
import { RatingBadge, VerifiedBadge } from './VendorBadges';

interface VendorStorefrontHeaderProps {
  vendorId: string;
  fallbackName?: string | null;
  cartCount: number;
  onBack: () => void;
  onOpenCart: () => void;
}

// Top of a vendor's product page: banner, square logo, store name, verified,
// rating, store address and distance, plus "Rate vendor" when the customer has
// a delivered order from them they haven't rated yet.
const VendorStorefrontHeader = ({ vendorId, fallbackName, cartCount, onBack, onOpenCart }: VendorStorefrontHeaderProps) => {
  const { user } = useAuth();
  const { defaultAddress } = useAddresses();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(false);

  const { data: store } = useQuery({
    queryKey: ['vendor-storefront', vendorId, defaultAddress?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vendor_storefront', {
        p_vendor_id: vendorId,
        p_address_id: defaultAddress?.id,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  // Latest delivered order from this vendor that the customer hasn't rated
  const { data: unrated } = useQuery({
    queryKey: ['unrated-vendor-order', vendorId, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: delivered } = await supabase
        .from('orders')
        .select('id, order_number')
        .eq('customer_id', user!.id)
        .eq('vendor_id', vendorId)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })
        .limit(20);
      if (!delivered?.length) return null;
      const { data: rated } = await supabase
        .from('vendor_ratings')
        .select('order_id')
        .eq('customer_id', user!.id)
        .in('order_id', delivered.map((o) => o.id));
      const ratedIds = new Set((rated ?? []).map((r) => r.order_id));
      return delivered.find((o) => !ratedIds.has(o.id)) ?? null;
    },
  });

  const name = store?.name || fallbackName || 'Vendor';

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="relative h-28 w-full bg-muted sm:h-40">
        {store?.banner_url && <img src={store.banner_url} alt="" className="h-full w-full object-cover" />}
        <Button
          variant="secondary"
          size="sm"
          onClick={onBack}
          className="absolute left-2 top-2 h-8 gap-1 bg-background/90 text-xs sm:text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Vendors
        </Button>
        <Button size="sm" onClick={onOpenCart} className="absolute right-2 top-2 h-8 gap-1 text-xs sm:text-sm">
          <ShoppingCart className="h-4 w-4" />
          Cart ({cartCount})
        </Button>
      </div>

      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:p-4">
        <div className="-mt-12 h-20 w-20 shrink-0 overflow-hidden rounded-xl border-4 border-card bg-muted shadow sm:-mt-14 sm:h-24 sm:w-24">
          {store?.logo_url ? (
            <img src={store.logo_url} alt={`${name} logo`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Store className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="break-words text-xl font-bold sm:text-2xl">{name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <RatingBadge rating={store?.average_rating == null ? null : Number(store.average_rating)} count={store?.rating_count ?? 0} />
            <VerifiedBadge verified={!!store?.verified} />
          </div>
          {store?.store_address && (
            <p className="flex items-start gap-1 text-xs text-muted-foreground sm:text-sm">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="break-words">
                {store.store_address}
                {store.distance_km != null && ` · ${formatKm(Number(store.distance_km))} away`}
              </span>
            </p>
          )}
        </div>

        {unrated && (
          <Button variant="outline" size="sm" onClick={() => setRating(true)} className="w-full sm:w-auto">
            <Star className="mr-1 h-4 w-4" />
            Rate vendor
          </Button>
        )}
      </div>

      {unrated && (
        <VendorRatingModal
          isOpen={rating}
          onClose={() => {
            setRating(false);
            queryClient.invalidateQueries({ queryKey: ['unrated-vendor-order', vendorId] });
            queryClient.invalidateQueries({ queryKey: ['vendor-storefront', vendorId] });
          }}
          vendorId={vendorId}
          vendorName={name}
          orderId={unrated.id}
          orderNumber={unrated.order_number}
        />
      )}
    </div>
  );
};

export default VendorStorefrontHeader;
