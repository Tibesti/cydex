import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { etaText, type DeliveryMode } from '@/lib/deliveryModes';
import { formatNaira } from '@/lib/pricing';

interface Props {
  modes: DeliveryMode[];
  value: string | null | undefined;
  onChange: (key: string) => void;
  disabled?: boolean;
  /** Show each mode's delivery fee in the list (they differ by price per km) */
  showFee?: boolean;
  id?: string;
}

// "Preferred delivery mode": riders with this vehicle get the order first. A
// mode can only be chosen while a rider using it is free nearby and the trip
// is within how far that mode goes.
const DeliveryModeSelect = ({ modes, value, onChange, disabled, showFee = true, id = 'delivery-mode' }: Props) => (
  <div className="space-y-1.5">
    <Label htmlFor={id}>Preferred delivery mode</Label>
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled || modes.every((m) => !m.available)}>
      <SelectTrigger id={id}><SelectValue placeholder="Choose a delivery mode" /></SelectTrigger>
      <SelectContent>
        {modes.map((m) => (
          <SelectItem key={m.key} value={m.key} disabled={!m.available}>
            {m.label}
            <span className="text-muted-foreground">
              {m.available
                ? ` · ${showFee ? `${formatNaira(Number(m.delivery_fee))} · ` : ''}${etaText(m.eta_min).toLowerCase()}`
                : m.in_range === false
                  ? ` · only goes up to ${Number(m.max_distance_km)} km`
                  : ' · no rider free right now'}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">
      Riders using it are offered the delivery first. If none accepts within 10 minutes, we offer it to our other
      delivery partners and let you know.
    </p>
  </div>
);

export default DeliveryModeSelect;
