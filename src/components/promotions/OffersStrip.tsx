import { useState } from 'react';
import { format } from 'date-fns';
import { Check, Copy, TicketPercent } from 'lucide-react';
import { toast } from 'sonner';
import { useMyPromotions, type MyPromotion } from '@/hooks/useMyPromotions';
import { useVehicleTypes } from '@/hooks/useVehicleTypes';
import { describePromotion, type PromoAudience } from '@/lib/promotions';

const WHERE_TO_ENTER: Record<Exclude<PromoAudience, 'all'>, string> = {
  customer: 'Enter it at checkout',
  vendor: 'Enter it when you request a rider',
  rider: 'Enter it when asked',
};

const CodeChip = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(`Code ${code} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the code');
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy code ${code}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary bg-background px-2 py-1 font-mono text-sm font-semibold"
    >
      {code}
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

// "Offers for you": the promotions the signed-in customer, vendor or rider can
// still use, with what's left of any limit. Automatic ones need nothing from
// them; coupon ones show the code to enter. Shows nothing when there are none.
const OffersStrip = ({ role }: { role: Exclude<PromoAudience, 'all'> }) => {
  const offers = useMyPromotions();
  const { labelOf } = useVehicleTypes();

  if (offers.length === 0) return null;

  const conditionsOf = (o: MyPromotion) => [
    o.max_distance_km != null ? `deliveries up to ${Number(o.max_distance_km)} km` : null,
    o.vehicle_types?.length ? o.vehicle_types.map(labelOf).join(' or ') : null,
  ].filter(Boolean).join(', ');
  const leftOf = (o: MyPromotion) => [
    o.uses_left != null ? `${o.uses_left} use${o.uses_left === 1 ? '' : 's'} left` : null,
    // Someone who hasn't used it yet needs one of the remaining places
    o.places_left != null && o.places_left > 0 ? `${o.places_left} place${o.places_left === 1 ? '' : 's'} left` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section aria-label="Offers for you" className="space-y-2">
      <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
        <TicketPercent className="h-5 w-5" /> Offers for you
      </h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((o) => {
          const conditions = conditionsOf(o);
          const left = leftOf(o);
          return (
            <li key={o.id} className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-medium">{describePromotion(o, role)}</p>
                {o.code && <CodeChip code={o.code} />}
              </div>
              <p className="text-sm text-muted-foreground">
                {o.name}{conditions ? ` · ${conditions}` : ''}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {o.code ? WHERE_TO_ENTER[role] : role === 'rider' ? 'Applied when you accept a delivery' : 'Applied automatically'}
                {' · '}ends {format(new Date(o.ends_at), 'd MMM, h:mm a')}{left ? ` · ${left}` : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default OffersStrip;
