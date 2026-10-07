import { useState } from 'react';
import { Loader2, Star, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { errorMessage } from '@/lib/address';
import { cn } from '@/lib/utils';

export interface RiderToRate {
  orderId: string;
  orderNumber: string;
  riderId: string;
  riderName: string | null;
  riderAvatar?: string | null;
}

interface RateRiderDialogProps {
  rider: RiderToRate | null;
  open: boolean;
  /** Closed without rating (e.g. "Not now") */
  onDismiss: () => void;
  onRated: () => void;
}

// Stars + optional comment for the rider of a delivered order
const RateRiderDialog = ({ rider, open, onDismiss, onRated }: RateRiderDialogProps) => {
  const { user } = useAuth();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStars(0);
    setHover(0);
    setFeedback('');
  };

  const submit = async () => {
    if (!rider || !user?.id || stars === 0) return;
    setSaving(true);
    const { error } = await supabase.from('rider_ratings').insert({
      order_id: rider.orderId,
      customer_id: user.id,
      rider_id: rider.riderId,
      rating: stars,
      feedback: feedback.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(errorMessage(error, 'Could not save your rating'));
      return;
    }
    toast.success('Thanks for rating your rider!');
    reset();
    onRated();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) {
          reset();
          onDismiss();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How was your delivery?</DialogTitle>
          <DialogDescription>Rate the rider who delivered order #{rider?.orderNumber}.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex flex-col items-center gap-2">
            <div className="h-16 w-16 overflow-hidden rounded-full bg-muted">
              {rider?.riderAvatar ? (
                <img src={rider.riderAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Truck className="h-7 w-7 text-muted-foreground" />
                </div>
              )}
            </div>
            <p className="font-medium">{rider?.riderName || 'Your rider'}</p>
          </div>

          <div className="flex gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                onClick={() => setStars(n)}
                onMouseEnter={() => setHover(n)}
                className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Star
                  className={cn(
                    'h-8 w-8 transition-colors',
                    n <= (hover || stars) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40',
                  )}
                />
              </button>
            ))}
          </div>

          <Textarea
            placeholder="Anything to add? (optional)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={300}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => { reset(); onDismiss(); }} disabled={saving}>
            Not now
          </Button>
          <Button onClick={submit} disabled={stars === 0 || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit rating
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RateRiderDialog;
