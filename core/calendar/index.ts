// Region-aware working-day counting. Pure. The single source of "how many days is this leave?".
import { eachDate, toISO } from "../dates";
import type { DayCount, DurationMode, ISODate, RegionCalendar } from "../types";

export function isWorkingDay(date: Date, cal: RegionCalendar): boolean {
  if (cal.weekendDays.includes(date.getUTCDay())) return false;
  if (cal.holidays.has(toISO(date))) return false;
  return true;
}

/**
 * Count working vs free days for a leave request.
 * - DAY:  a single full day
 * - HALF: a single half day (0.5 working if it's a working day)
 * - MULTI: an inclusive range start→end
 */
export function countDays(
  startISO: ISODate,
  endISO: ISODate,
  mode: DurationMode,
  cal: RegionCalendar,
): DayCount {
  if (mode === "HALF") {
    const d = new Date(`${startISO}T00:00:00Z`);
    return isWorkingDay(d, cal)
      ? { workingDays: 0.5, freeDays: 0 }
      : { workingDays: 0, freeDays: 1 };
  }

  let workingDays = 0;
  let freeDays = 0;
  for (const d of eachDate(startISO, mode === "DAY" ? startISO : endISO)) {
    if (isWorkingDay(d, cal)) workingDays += 1;
    else freeDays += 1;
  }
  return { workingDays, freeDays };
}
