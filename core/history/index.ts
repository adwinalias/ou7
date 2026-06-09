// Pure helpers for the My-Leave history list (Epic 7.1). No I/O. lib/myleave fetches the
// rows; these format a duration and total the numeric columns deterministically.
import { round } from "../allowance";
import { daysInclusive, parseISO } from "../dates";
import type { DurationMode, ISODate } from "../types";

/** Human-readable duration for a leave row. */
export function durationLabel(mode: DurationMode, fromISO: ISODate, toISO: ISODate): string {
  if (mode === "HALF") return "½ day";
  if (mode === "DAY") return "1 day";
  const n = daysInclusive(parseISO(fromISO), parseISO(toISO));
  return `${n} day${n === 1 ? "" : "s"}`;
}

export interface NumericColumns {
  freeDays: number;
  workingDays: number;
  allowanceDays: number;
}

/** Column totals for a set of rows (rounded to avoid floating-point noise). */
export function sumColumns(rows: NumericColumns[]): NumericColumns {
  const t = rows.reduce(
    (a, r) => ({
      freeDays: a.freeDays + r.freeDays,
      workingDays: a.workingDays + r.workingDays,
      allowanceDays: a.allowanceDays + r.allowanceDays,
    }),
    { freeDays: 0, workingDays: 0, allowanceDays: 0 },
  );
  return { freeDays: round(t.freeDays), workingDays: round(t.workingDays), allowanceDays: round(t.allowanceDays) };
}
