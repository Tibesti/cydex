import { MapPin, Store } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatKm } from '@/lib/riderLocation';
import type { VendorCardData } from '@/hooks/useVendorCards';
import { RatingBadge, VerifiedBadge } from './VendorBadges';

// A vendor in the customer's lists: banner, square logo, name, verified,
// rating, distance and what they sell
const VendorCard = ({ vendor, onSelect }: { vendor: VendorCardData; onSelect: (vendor: VendorCardData) => void }) => (
  <Card
    role="button"
    tabIndex={0}
    onClick={() => onSelect(vendor)}
    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(vendor)}
    className="group flex h-full cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <div className="relative h-20 w-full bg-muted sm:h-24">
      {vendor.banner_url && (
        <img src={vendor.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" />
      )}
      <div className="absolute -bottom-6 left-3 h-14 w-14 overflow-hidden rounded-lg border-2 border-background bg-muted shadow-sm">
        {vendor.logo_url ? (
          <img src={vendor.logo_url} alt={`${vendor.name} logo`} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Store className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
    <div className="flex flex-1 flex-col gap-1.5 p-3 pt-8">
      <h3 className="break-words font-semibold leading-tight">{vendor.name}</h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RatingBadge rating={vendor.average_rating} count={vendor.rating_count} />
        <VerifiedBadge verified={vendor.verified} />
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        {formatKm(vendor.distance_km)} away · {vendor.product_count} product{vendor.product_count === 1 ? '' : 's'}
      </div>
      {vendor.categories.length > 0 && (
        <p className="line-clamp-1 text-xs text-muted-foreground">{vendor.categories.join(' · ')}</p>
      )}
    </div>
  </Card>
);

export default VendorCard;
