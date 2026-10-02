import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import RateRiderDialog, { type RiderToRate } from './RateRiderDialog';

// "Rate your rider" on a delivered order, until they've been rated
const RateRiderButton = ({ rider }: { rider: RiderToRate }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = ['rider-rated', rider.orderId];

  const { data: rated = true } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data } = await supabase.from('rider_ratings').select('id').eq('order_id', rider.orderId).maybeSingle();
      return !!data;
    },
  });

  if (rated) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Star className="mr-1 h-4 w-4" />
        Rate your rider
      </Button>
      <RateRiderDialog
        rider={rider}
        open={open}
        onDismiss={() => setOpen(false)}
        onRated={() => {
          setOpen(false);
          queryClient.invalidateQueries({ queryKey: key });
        }}
      />
    </>
  );
};

export default RateRiderButton;
