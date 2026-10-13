import { TicketPercent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMyPromotions, type MyPromotion } from '@/hooks/useMyPromotions';
import type { DeliveryMode } from '@/lib/deliveryModes';
import { formatNaira } from '@/lib/pricing';
import { describePromotion, type PromoAudience } from '@/lib/promotions';

interface Props {
  role: Exclude<PromoAudience, 'all'>;
  /** What the quote applied to this order */
  promotionName: string | null | undefined;
  discount: number | null | undefined;
  usesLeft?: number | null;
  /** The discount came from the coupon they entered (not an automatic one) */
  couponApplied: boolean;
  /** Which of their discounts could fit this order (e.g. items discounts of this vendor only) */
  fits?: (offer: MyPromotion) => boolean;
  /** Tapping a code enters it */
  onUseCode: (code: string) => void;
  /** This order's delivery mode and distance, to explain a discount that isn't applying */
  vehicleType?: string | null;
  distanceKm?: number | null;
  modes?: DeliveryMode[];
  /** Switch to the delivery mode a discount needs */
  onPickMode?: (key: string) => void;
  disabled?: boolean;
  thing?: string;
}

const km = (n: number) => `${Number(Number(n).toFixed(1))} km`;

// At checkout:
//  - says plainly when a discount has been applied by itself;
//  - for an automatic discount that ISN'T applying, says what it needs (a
//    delivery mode, a shorter trip), with a one-tap switch to that mode;
//  - lists the coupon codes this person can use, one tap to apply.
// One discount applies per order, so using a code replaces the automatic one.
const CheckoutOffers = ({
  role, promotionName, discount, usesLeft, couponApplied, fits, onUseCode, vehicleType, distanceKm, modes = [], onPickMode,
  disabled, thing = 'order',
}: Props) => {
  const offers = useMyPromotions().filter((o) => !fits || fits(o));
  const codes = couponApplied ? [] : offers.filter((o) => !!o.code);
  const automatic = !couponApplied && Number(discount) > 0;
  const label = (key: string) => modes.find((m) => m.key === key)?.label ?? key.replace(/_/g, ' ');

  // Automatic discounts they have that this order isn't getting, and why
  const missed = offers
    .filter((o) => !o.code && o.applies_to !== 'commission' && !(automatic && o.name === promotionName))
    .map((o) => {
      if (o.max_distance_km != null && distanceKm != null && Number(distanceKm) > Number(o.max_distance_km)) {
        return { offer: o, why: `Only for deliveries up to ${km(o.max_distance_km)}. This one is ${km(Number(distanceKm))}.`, switchTo: null };
      }
      if (o.vehicle_types?.length && (!vehicleType || !o.vehicle_types.includes(vehicleType))) {
        const usable = o.vehicle_types.filter((k) => modes.find((m) => m.key === k)?.available);
        const names = o.vehicle_types.map(label).join(' or ');
        return usable.length > 0
          ? { offer: o, why: `Choose ${usable.map(label).join(' or ')} as your delivery mode to get it.`, switchTo: usable[0] }
          : { offer: o, why: `Only with ${names}, which isn't available for this ${thing} right now.`, switchTo: null };
      }
      // Fits this order, so something else was chosen over it
      return couponApplied
        ? { offer: o, why: 'Not used, because your coupon is applied. One discount applies per order.', switchTo: null }
        : automatic
          ? { offer: o, why: 'Not used, because another discount saves you more. One discount applies per order.', switchTo: null }
          : null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  if (!automatic && codes.length === 0 && missed.length === 0) return null;

  return (
    <div className="space-y-2">
      {automatic && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-green-600/40 bg-green-600/10 p-3 text-sm">
          <TicketPercent className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-400" />
          <div className="min-w-0">
            <p className="font-medium text-green-800 dark:text-green-300">
              Discount applied: {promotionName || 'Discount'}
            </p>
            <p className="text-muted-foreground">
              You save {formatNaira(Number(discount))} on this {thing}. It's applied automatically.
              {usesLeft != null && (usesLeft <= 1 ? ' This is the last time you can use it.' : ` You can use it ${usesLeft} times, including this ${thing}.`)}
            </p>
          </div>
        </div>
      )}

      {missed.map(({ offer, why, switchTo }) => (
        <div key={offer.id} className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium">
              {offer.name}: {describePromotion(offer, role).replace(/^./, (c) => c.toLowerCase())}
            </p>
            <p className="text-muted-foreground">{why}</p>
          </div>
          {switchTo && onPickMode && (
            <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={disabled} onClick={() => onPickMode(switchTo)}>
              Switch to {label(switchTo)}
            </Button>
          )}
        </div>
      ))}

      {codes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {automatic ? 'Or use one of your codes instead (one discount applies per order):' : 'Codes you can use, tap one to apply it:'}
          </p>
          <div className="flex flex-wrap gap-2">
            {codes.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={disabled}
                onClick={() => onUseCode(o.code!)}
                className="rounded-md border border-dashed border-primary bg-primary/5 px-2.5 py-1.5 text-left text-xs hover:bg-primary/10 disabled:opacity-50"
              >
                <span className="font-mono text-sm font-semibold">{o.code}</span>
                <span className="block text-muted-foreground">{describePromotion(o, role)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckoutOffers;
