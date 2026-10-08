
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, MessageSquare, User } from 'lucide-react';
import PagedList from '@/components/ui/paged-list';

interface ReviewsTabProps {
  profile: any;
  recentReviews: any[];
}

const ReviewsTab = ({ profile, recentReviews }: ReviewsTabProps) => {
  const hasReviews = recentReviews && recentReviews.length > 0;
  
  // Calculate rating breakdown from reviews
  const ratingBreakdown = hasReviews ? [5, 4, 3, 2, 1].map(rating => {
    const count = recentReviews.filter(review => review.rating === rating).length;
    const percentage = recentReviews.length > 0 ? (count / recentReviews.length) * 100 : 0;
    return { rating, count, percentage };
  }) : [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Star className="h-5 w-5 mr-2 text-amber-500" />
            Customer Reviews
          </CardTitle>
          <CardDescription>
            {hasReviews ? `${recentReviews.length} customer reviews` : 'What customers will say about your delivery service'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          {!hasReviews ? (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No reviews yet</h3>
              <p className="text-gray-500">Complete deliveries to start receiving customer reviews!</p>
            </div>
          ) : (
            <div className="space-y-4">
              <PagedList items={recentReviews} getKey={(review) => review.id} render={(review) => (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center">
                      <User className="h-8 w-8 text-gray-400 bg-gray-100 rounded-full p-1" />
                      <div className="ml-3">
                        <p className="font-medium text-sm">{review.customer_name}</p>
                        <p className="text-xs text-gray-500">{review.created_at}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star 
                          key={i} 
                          className={`h-4 w-4 ${i < review.rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}`} 
                        />
                      ))}
                      <span className="ml-2 text-sm font-medium">{review.rating}.0</span>
                    </div>
                  </div>
                  
                  {review.comment && (
                    <p className="text-sm text-gray-700 mb-3">{review.comment}</p>
                  )}
                  
                  <div className="flex gap-4 text-xs">
                    <div className="flex items-center">
                      <span className="text-gray-500">Delivery:</span>
                      <div className="flex ml-1">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            className={`h-3 w-3 ${i < review.delivery_rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}`} 
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <span className="text-gray-500">Communication:</span>
                      <div className="flex ml-1">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            className={`h-3 w-3 ${i < review.communication_rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}`} 
                          />
                        ))}
                      </div>
                    </div>
                  </div>
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
          {!hasReviews ? (
            <div className="text-center py-8">
              <div className="flex items-center justify-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-8 w-8 text-gray-300" />
                ))}
              </div>
              <p className="text-2xl font-bold text-gray-400">0.0/5.0</p>
              <p className="text-gray-500 mt-2">No ratings yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="flex items-center justify-center mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`h-8 w-8 ${i < Math.floor(profile.stats.rating) ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}`} />
                  ))}
                </div>
                <p className="text-3xl font-bold">{profile.stats.rating.toFixed(1)}/5.0</p>
                <p className="text-gray-500">Based on {recentReviews.length} reviews</p>
              </div>
              
              <div className="space-y-2">
                {ratingBreakdown.map(({ rating, count, percentage }) => (
                  <div key={rating} className="flex items-center gap-3">
                    <span className="text-sm w-8">{rating} ★</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-amber-500 h-2 rounded-full" 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 w-8">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default ReviewsTab;
