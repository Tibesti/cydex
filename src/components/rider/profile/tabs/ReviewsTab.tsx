import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Star, MessageSquare, User } from 'lucide-react';
import PagedList from '@/components/ui/paged-list';
import type { ReviewData, RiderProfileData } from '@/hooks/rider/types';
import { cn } from '@/lib/utils';

interface ReviewsTabProps {
  profile: RiderProfileData;
  recentReviews: ReviewData[];
}

const Stars = ({ value, className }: { value: number; className?: string }) => (
  <div className="flex" aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star
        key={i}
        className={cn(className, i <= Math.round(value) ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30')}
      />
    ))}
  </div>
);

// Customers' ratings of this rider (rider_ratings), newest first
const ReviewsTab = ({ profile, recentReviews }: ReviewsTabProps) => {
  const hasReviews = recentReviews.length > 0;
  const average = hasReviews
    ? Number(profile.stats?.rating) || recentReviews.reduce((sum, r) => sum + r.rating, 0) / recentReviews.length
    : 0;
  const ratingBreakdown = [5, 4, 3, 2, 1].map((rating) => {
    const count = recentReviews.filter((review) => review.rating === rating).length;
    return { rating, count, percentage: hasReviews ? (count / recentReviews.length) * 100 : 0 };
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Star className="mr-2 h-5 w-5 text-amber-500" />
            Customer Reviews
          </CardTitle>
          <CardDescription>
            {hasReviews
              ? `${recentReviews.length} customer review${recentReviews.length === 1 ? '' : 's'}`
              : 'What customers say about your deliveries'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          {!hasReviews ? (
            <div className="py-12 text-center">
              <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
              <h3 className="mb-2 text-lg font-medium text-foreground">No reviews yet</h3>
              <p className="text-muted-foreground">Customers can rate you after each delivery.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <PagedList items={recentReviews} getKey={(review) => review.id} render={(review) => (
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center">
                      <User className="h-8 w-8 shrink-0 rounded-full bg-muted p-1 text-muted-foreground" />
                      <div className="ml-3 min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{review.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{review.created_at}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Stars value={review.rating} className="h-4 w-4" />
                      <span className="ml-2 text-sm font-medium text-foreground">{review.rating.toFixed(1)}</span>
                    </div>
                  </div>
                  {review.comment && <p className="mt-3 text-sm text-foreground/90">“{review.comment}”</p>}
                </div>
              )} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Rating Overview</CardTitle>
          <CardDescription>
            {hasReviews ? 'Your rating breakdown from customer reviews' : 'Your rating breakdown will appear here once you receive reviews'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <div className="mb-6 text-center">
            <div className="mb-2 flex justify-center">
              <Stars value={average} className="h-8 w-8" />
            </div>
            <p className={cn('text-3xl font-bold', hasReviews ? 'text-foreground' : 'text-muted-foreground')}>
              {average.toFixed(1)}/5.0
            </p>
            <p className="text-muted-foreground">
              {hasReviews ? `Based on ${recentReviews.length} review${recentReviews.length === 1 ? '' : 's'}` : 'No ratings yet'}
            </p>
          </div>
          {hasReviews && (
            <div className="space-y-2">
              {ratingBreakdown.map(({ rating, count, percentage }) => (
                <div key={rating} className="flex items-center gap-3">
                  <span className="w-8 text-sm text-foreground">{rating} ★</span>
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-amber-500" style={{ width: `${percentage}%` }} />
                  </div>
                  <span className="w-8 text-right text-sm text-muted-foreground">{count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default ReviewsTab;
