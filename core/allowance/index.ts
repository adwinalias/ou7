// The allowance engine. Pure, deterministic, exhaustively tested. No I/O, no AI.
// Balances are always DERIVED here — never hand-stored.
import { parseISO } from "../dates";
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
 * Full annual entitlement granted UPFRONT, pro-rated for mid-year joiners — MONTH-BASED
 * (ADR-0009): annual ÷ 12 × (months from the joining month through December, inclusive),
 * rounded UP to a whole day. The joining month counts as a full month. Joined on/before the
 * year start → full annual, unrounded. Joined after the year → 0.
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
  if (j <= ys) return annual; // on/before year start → full annual (unrounded)
  if (j > ye) return 0; // joined after the year → none
  const months = 12 - j.getUTCMonth(); // join month → Dec inclusive: Jan(0)→12 … Dec(11)→1
  return Math.ceil((annual / 12) * months);
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

/**
 * Remaining in the Remote-only Holiday ledger (v2b / ADR-0010): an HR-set, per-year,
 * NON-CARRY balance, separate from annual leave. Remaining = set days − taken (taken comes
 * from holiday-bucket consumption, which is planned, not yet built). Engine-derived.
 */
export function holidayRemaining(days: number, taken = 0): number {
  return round(days - taken);
}
