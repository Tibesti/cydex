import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DAYS, DAY_NAMES, type OpeningHours } from '@/lib/openingHours';

interface Props {
  prepMinutes: string;
  onPrepChange: (v: string) => void;
  hours: OpeningHours;
  onHoursChange: (h: OpeningHours) => void;
  disabled?: boolean;
}

// Preparation time and the days and times a store takes orders
const OpeningHoursEditor = ({ prepMinutes, onPrepChange, hours, onHoursChange, disabled }: Props) => (
  <div className="space-y-4">
    <div className="space-y-1.5">
      <Label htmlFor="prep-time">Preparation time (minutes)*</Label>
      <Input
        id="prep-time"
        type="number"
        inputMode="numeric"
        min={0}
        max={240}
        className="w-32"
        value={prepMinutes}
        disabled={disabled}
        onChange={(e) => onPrepChange(e.target.value.replace(/\D/g, '').slice(0, 3))}
      />
      <p className="text-xs text-muted-foreground">
        How long an order usually takes to get ready. Customers see it in their estimated delivery time.
      </p>
    </div>

    <div className="space-y-2">
      <Label>Opening hours*</Label>
      <ul className="divide-y rounded-lg border">
        {DAYS.map((d) => {
          const h = hours[d] ?? null;
          return (
            <li key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5">
              <label className="flex w-32 items-center gap-2 text-sm font-medium">
                <Switch
                  checked={!!h}
                  disabled={disabled}
                  onCheckedChange={(on) => onHoursChange({ ...hours, [d]: on ? { open: '08:00', close: '20:00' } : null })}
                  aria-label={`Open on ${DAY_NAMES[d]}`}
                />
                {DAY_NAMES[d]}
              </label>
              {h ? (
                <div className="flex items-center gap-2">
                  <Input type="time" aria-label={`${DAY_NAMES[d]} opens`} className="w-[7.5rem]" value={h.open} disabled={disabled}
                    onChange={(e) => onHoursChange({ ...hours, [d]: { ...h, open: e.target.value } })} />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input type="time" aria-label={`${DAY_NAMES[d]} closes`} className="w-[7.5rem]" value={h.close} disabled={disabled}
                    onChange={(e) => onHoursChange({ ...hours, [d]: { ...h, close: e.target.value } })} />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Closed</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Customers can only order while you're open. A closing time earlier than the opening time means you close after midnight.
      </p>
    </div>
  </div>
);

export default OpeningHoursEditor;
