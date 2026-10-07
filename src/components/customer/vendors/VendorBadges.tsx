import { BadgeCheck, ShieldAlert, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export const VerifiedBadge = ({ verified, className }: { verified: boolean; className?: string }) =>
  verified ? (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400', className)}>
      <BadgeCheck className="h-3.5 w-3.5" /> Verified
    </span>
  ) : (
    <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
      <ShieldAlert className="h-3.5 w-3.5" /> Unverified
    </span>
  );

export const RatingBadge = ({ rating, count, className }: { rating: number | null; count: number; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1 text-xs', className)}>
    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
    {count > 0 && rating != null ? (
      <>
        <span className="font-medium">{rating.toFixed(1)}</span>
        <span className="text-muted-foreground">({count})</span>
      </>
    ) : (
      <span className="text-muted-foreground">New</span>
    )}
  </span>
);
