import { Clock } from 'lucide-react';
import type { VendorHoursInfo } from '@/hooks/useVendorHours';
import { formatTime, summariseHours } from '@/lib/openingHours';
import { cn } from '@/lib/utils';

// "8:00 am – 8:00 pm", "Closed today", or nothing when the vendor hasn't set hours
export const todayHoursText = (info: VendorHoursInfo | undefined) => {
  if (!info?.hours_set) return null;
  return info.today_open && info.today_close
    ? `${formatTime(info.today_open)} – ${formatTime(info.today_close)}`
    : 'Closed today';
};

// Open / Closed pill. Vendors that haven't set hours are treated as open and
// show nothing.
export const OpenBadge = ({ info, className }: { info: VendorHoursInfo | undefined; className?: string }) => {
  if (!info?.hours_set) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        info.is_open
          ? 'bg-green-600/15 text-green-700 dark:text-green-400'
          : 'bg-destructive/15 text-destructive',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', info.is_open ? 'bg-green-600' : 'bg-destructive')} />
      {info.is_open ? 'Open' : 'Closed'}
    </span>
  );
};

// One line for a vendor card: today's hours and how long they take to prepare
export const VendorHoursLine = ({ info }: { info: VendorHoursInfo | undefined }) => {
  if (!info) return null;
  const today = todayHoursText(info);
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {today ? `${today} · ` : ''}Ready in about {info.prep_time_minutes} min
      </span>
    </div>
  );
};

// The week's hours for the store page
export const WeeklyHours = ({ info }: { info: VendorHoursInfo | undefined }) => {
  if (!info?.hours_set) return null;
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {summariseHours(info.opening_hours).map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
};
