// Vendor opening hours, as stored in vendor_hours.opening_hours:
//   { mon: { open: '08:00', close: '20:00' }, sun: null, ... }  (null or missing = closed)
// Times are Nigerian time. The database decides whether a vendor is open
// (vendor_is_open); this file is for editing and showing the hours.
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];
export type DayHours = { open: string; close: string } | null;
export type OpeningHours = Partial<Record<Day, DayHours>>;

export const DAY_NAMES: Record<Day, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

export const DEFAULT_HOURS: OpeningHours = Object.fromEntries(
  DAYS.map((d) => [d, d === 'sun' ? null : { open: '08:00', close: '20:00' }]),
) as OpeningHours;

// "08:00" -> "8:00 am"
export const formatTime = (t: string | null | undefined) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export const hoursProblem = (hours: OpeningHours): string | null => {
  const open = DAYS.filter((d) => hours[d]);
  if (open.length === 0) return 'Choose at least one day you’re open.';
  for (const d of open) {
    const h = hours[d]!;
    if (!h.open || !h.close) return `Enter opening and closing times for ${DAY_NAMES[d]}.`;
    if (h.open === h.close) return `${DAY_NAMES[d]}: opening and closing times can’t be the same.`;
  }
  return null;
};

// "Mon–Sat 8:00 am – 8:00 pm" style lines for a store page
export const summariseHours = (hours: OpeningHours): string[] => {
  const lines: string[] = [];
  let i = 0;
  while (i < DAYS.length) {
    const h = hours[DAYS[i]] ?? null;
    let j = i;
    while (j + 1 < DAYS.length && JSON.stringify(hours[DAYS[j + 1]] ?? null) === JSON.stringify(h)) j++;
    const days = i === j ? DAY_NAMES[DAYS[i]].slice(0, 3) : `${DAY_NAMES[DAYS[i]].slice(0, 3)}–${DAY_NAMES[DAYS[j]].slice(0, 3)}`;
    lines.push(`${days}: ${h ? `${formatTime(h.open)} – ${formatTime(h.close)}` : 'Closed'}`);
    i = j + 1;
  }
  return lines;
};
