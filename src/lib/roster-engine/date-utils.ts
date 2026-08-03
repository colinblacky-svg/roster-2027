// All dates in the roster engine are plain "YYYY-MM-DD" strings representing a
// calendar day with no time-of-day or timezone component. Arithmetic goes
// through Date.UTC exclusively so results never depend on the host's local
// timezone or DST transitions.

export type ISODate = string;

export function toISODate(year: number, month1To12: number, day: number): ISODate {
  const mm = String(month1To12).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function toUTCMillis(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTCMillis(ms: number): ISODate {
  const d = new Date(ms);
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTCMillis(toUTCMillis(date) + days * 86_400_000);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTCMillis(a) - toUTCMillis(b)) / 86_400_000);
}

/** 0 = Monday .. 6 = Sunday (ISO-style, unlike Date#getDay's Sunday=0). */
export function isoWeekday(date: ISODate): number {
  const jsDay = new Date(toUTCMillis(date)).getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7;
}

export function mondayOfWeek(date: ISODate): ISODate {
  return addDays(date, -isoWeekday(date));
}

export function isBefore(a: ISODate, b: ISODate): boolean {
  return a < b;
}

export function isAfter(a: ISODate, b: ISODate): boolean {
  return a > b;
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function* eachDay(start: ISODate, endInclusive: ISODate): Generator<ISODate> {
  let cur = start;
  while (!isAfter(cur, endInclusive)) {
    yield cur;
    cur = addDays(cur, 1);
  }
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatDateLong(date: ISODate): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

export function monthLabel(date: ISODate): string {
  const [y, m] = date.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
