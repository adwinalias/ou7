// The allowance engine. Pure, deterministic, exhaustively tested. No I/O, no AI.
// Balances are always DERIVED here — never hand-stored.
import { daysInclusive, parseISO } from "../dates";
import type { AllowanceInputs, CarryOverRule, ISODate } from "../types";

/** Round to a fixed number of decimals to avoid floating-point noise. */
export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Round to the nearest half day (leave is booked in whole/half days). */
export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Remaining = Opening + Carry-over + Adjustments − Approved-taken − Deductions. */
export function computeRemaining(i: AllowanceInputs): number {
  return round(i.opening + i.carryOver + i.adjustments - i.takenApproved - i.deductions);
}

/** Available to book = Remaining − Pending. */
export function computeAvailable(remaining: number, pending: number): number {
  return round(remaining - pending);
}

/**
 * Full annual entitlement granted UPFRONT, pro-rated for mid-year joiners by joining date.
 * Joined on/before the year start → full annual. After year end → 0.
 */
export function proRataOpening(
  annual: number,
  joiningISO: ISODate,
  yearStartISO: ISODate,
  yearEndISO: ISODate,
): number {
  const ys = parseISO(yearStartISO);
  const ye = parseISO(yearEndISO);
  const j = parseISO(joiningISO);
  if (j <= ys) return annual;
  if (j > ye) return 0;
  const totalDays = daysInclusive(ys, ye);
  const remainingDays = daysInclusive(j, ye);
  return roundToHalf(annual * (remainingDays / totalDays));
}

/**
 * Carry-over into the next period, per the market's rule.
 * capDays null → no carry-over (0). Otherwise min(previousRemaining, cap), never negative.
 */
export function applyCarryOver(previousRemaining: number, rule: CarryOverRule): number {
  if (rule.capDays == null) return 0;
  return round(Math.max(0, Math.min(previousRemaining, rule.capDays)));
}

/** Hard block: a request can only be booked if it fits within available (no negatives, no borrowing). */
export function canBook(available: number, requestedDays: number): boolean {
  return requestedDays <= available + 1e-9;
}
