import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PERIOD_LABELS, type Period, type PeriodPreset } from '@/lib/adminPeriod';

// All time / this month / last month / last 3 or 6 months / custom dates
const PeriodFilter = ({ value, onChange }: { value: Period; onChange: (p: Period) => void }) => (
  <div className="flex flex-col gap-2 xs:flex-row xs:items-center">
    <Select value={value.preset} onValueChange={(v) => onChange({ ...value, preset: v as PeriodPreset })}>
      <SelectTrigger className="xs:w-44" aria-label="Period"><SelectValue /></SelectTrigger>
      <SelectContent>
        {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
          <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    {value.preset === 'custom' && (
      <div className="flex items-center gap-2">
        <Input
          type="date"
          aria-label="From"
          value={value.from ?? ''}
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
          className="w-full xs:w-40"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          aria-label="To"
          value={value.to ?? ''}
          min={value.from || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
          className="w-full xs:w-40"
        />
      </div>
    )}
  </div>
);

export default PeriodFilter;
