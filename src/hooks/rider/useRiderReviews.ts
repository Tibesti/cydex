import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ReviewData } from './types';

export const useRiderReviews = () => {
  // Customers rate their rider after delivery (rider_ratings). Reviews an admin
  // has hidden are left out by the database.
  const fetchRecentReviews = useCallback(async (userId: string): Promise<ReviewData[]> => {
    try {
      const { data, error } = await supabase
        .from('rider_ratings')
        .select('id, rating, feedback, created_at, customer:profiles!rider_ratings_customer_id_fkey(name)')
        .eq('rider_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      return ((data ?? []) as unknown as {
        id: string; rating: number; feedback: string | null; created_at: string; customer: { name: string | null } | null;
      }[]).map((review) => ({
        id: review.id,
        customer_name: review.customer?.name || 'Customer',
        rating: review.rating,
        comment: review.feedback || '',
        created_at: new Date(review.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }),
      }));
    } catch (error) {
      console.error('[RiderProfile] Error fetching reviews:', error);
      return [];
    }
  }, []);

  return {
    fetchRecentReviews
  };
};
