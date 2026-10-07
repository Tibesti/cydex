import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import RateRiderDialog, { type RiderToRate } from './RateRiderDialog';

const checkedKey = (userId: string) => `cydex:rider-rating-checked:${userId}`;

// At login (once per browser session), asks the customer to rate the rider of
// their most recent delivered order, unless they've already rated them or
// closed this pop-up for that order before (rider_rating_prompt in the database).
const RiderRatingPrompt = () => {
  const { user } = useAuth();
  const [rider, setRider] = useState<RiderToRate | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    try {
      if (sessionStorage.getItem(checkedKey(user.id))) return;
      sessionStorage.setItem(checkedKey(user.id), '1');
    } catch {
      // storage unavailable: still check once per page load
    }

    supabase.rpc('rider_rating_prompt').then(({ data }) => {
      const row = data?.[0];
      if (row) {
        setRider({
          orderId: row.order_id,
          orderNumber: row.order_number,
          riderId: row.rider_id,
          riderName: row.rider_name,
          riderAvatar: row.rider_avatar,
        });
      }
    });
  }, [user?.id]);

  // Closing without rating: don't ask again for this order
  const dismiss = async () => {
    const pending = rider;
    setRider(null);
    if (pending && user?.id) {
      await supabase.from('rider_rating_prompt_dismissals').insert({ order_id: pending.orderId, customer_id: user.id });
    }
  };

  return <RateRiderDialog rider={rider} open={!!rider} onDismiss={dismiss} onRated={() => setRider(null)} />;
};

export default RiderRatingPrompt;
