// Pure calendar math over ISO "YYYY-MM-DD" strings. All arithmetic is UTC-based
// so device timezones can't shift a date; todayISO alone reads the local clock
// (the user's "today" is a local concept). ISO strings compare lexicographically.
export interface DateRange { start: string; end: string }
export type PartialRange = { start?: string; end?: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");
const toUTC = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toISO = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDaysISO(iso: string, n: number): string {
  return toISO(new Date(toUTC(iso).getTime() + n * DAY_MS));
}

export function inclusiveDayCount(start: string, end: string): number {
  return Math.round((toUTC(end).getTime() - toUTC(start).getTime()) / DAY_MS) + 1;
}

export function selectDay(sel: PartialRange, day: string): PartialRange {
  if (!sel.start || sel.end) return { start: day };
  if (day < sel.start) return { start: day };
  return { start: sel.start, end: day };
}

export function isInRange(day: string, sel: PartialRange): boolean {
  return !!sel.start && !!sel.end && day > sel.start && day < sel.end;
}

export function monthGrid(year: number, month0: number): (string | null)[][] {
  const startDow = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month0 + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function monthLabel(year: number, month0: number): string {
  return `${MONTHS_FULL[month0]} ${year}`;
}

export function nextMonth(y: number, m0: number): [number, number] {
  return m0 === 11 ? [y + 1, 0] : [y, m0 + 1];
}

export function prevMonth(y: number, m0: number): [number, number] {
  return m0 === 0 ? [y - 1, 11] : [y, m0 - 1];
}

export function formatShort(iso: string): string {
  const d = toUTC(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatDayHeader(iso: string): string {
  const d = toUTC(iso);
  return `${DOW[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
