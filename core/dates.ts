// Pure date helpers. UTC-based to keep day-counting deterministic across timezones.
// (Display/scheduling happens in Asia/Dubai at the edges; the engine works in plain dates.)

export type ISODate = string; // "YYYY-MM-DD"

export function parseISO(d: ISODate): Date {
  // Defaults satisfy noUncheckedIndexedAccess; for a well-formed YYYY-MM-DD all three are present.
  const [y = 0, m = 1, day = 1] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Inclusive day count between two dates. */
export function daysInclusive(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

export function* eachDate(startISO: ISODate, endISO: ISODate): Generator<Date> {
  let d = parseISO(startISO);
  const end = parseISO(endISO);
  while (d.getTime() <= end.getTime()) {
    yield d;
    d = addDays(d, 1);
  }
}

/** Two inclusive date ranges overlap? */
export function rangesOverlap(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate): boolean {
  return parseISO(aStart) <= parseISO(bEnd) && parseISO(bStart) <= parseISO(aEnd);
}

/**
 * Time-of-day greeting from a 0–23 hour (pure, deterministic — no clock read here).
 * Callers compute the hour in Asia/Dubai at the edge and pass it in. (Epic 19.6, L3.)
 *   05:00–11:59 → morning · 12:00–16:59 → afternoon · otherwise → evening.
 */
export function greetingForHour(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}
