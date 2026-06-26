// Leave request validation — composes the calendar + allowance engine + policy rules.
// Pure: returns errors; performs no I/O. The API layer fetches data and calls this.
import { canBook } from "../allowance";
import { countDays } from "../calendar";
import { addDays, parseISO, rangesOverlap, toISO } from "../dates";
import type { DateRange, DurationMode, ISODate, RegionCalendar, RestrictedRange } from "../types";

export interface LeaveValidationInput {
  startISO: ISODate;
  endISO: ISODate;
  mode: DurationMode;
  cal: RegionCalendar;
  deductsAllowance: boolean;
  available: number;
  existing: DateRange[]; // the employee's current approved/pending ranges
  restricted?: RestrictedRange[]; // company/department/region blackout ranges (Epic 10.2)
  noteRequired?: boolean;
  note?: string;
  attachmentRequired?: boolean;
  attachmentThresholdDays?: number | null;
  hasAttachment?: boolean;
  /** "Today" in Asia/Dubai as YYYY-MM-DD. Must be provided together with noticePeriodDays. */
  todayISO?: ISODate;
  /** Calendar days of notice required. Negative = allow backdating by |n| days. */
  noticePeriodDays?: number;
  /** Minimum working days per request. A HALF (0.5) request fails minLengthDays: 1. */
  minLengthDays?: number;
  /** Maximum consecutive working days per request. */
  maxConsecutiveDays?: number;
}

export interface LeaveValidationResult {
  ok: boolean;
  errors: string[];
  workingDays: number;
  freeDays: number;
  allowanceDays: number;
}

export function validateLeaveRequest(input: LeaveValidationInput): LeaveValidationResult {
  const errors: string[] = [];
  const { workingDays, freeDays } = countDays(input.startISO, input.endISO, input.mode, input.cal);
  const allowanceDays = input.deductsAllowance ? workingDays : 0;

  if (workingDays <= 0) {
    errors.push("This request covers only non-working days.");
  } else {
    // Length limits (story 26.4) — only checked when workingDays > 0.
    if (input.minLengthDays != null && input.minLengthDays > 0 && workingDays < input.minLengthDays) {
      errors.push(`This leave type requires at least ${input.minLengthDays} working day(s).`);
    }
    if (input.maxConsecutiveDays != null && input.maxConsecutiveDays > 0 && workingDays > input.maxConsecutiveDays) {
      errors.push(`This leave type allows at most ${input.maxConsecutiveDays} consecutive working day(s).`);
    }
  }

  if (input.existing.some((r) => rangesOverlap(input.startISO, input.endISO, r.startISO, r.endISO))) {
    errors.push("Leave already requested for these/this date(s).");
  }

  // Restricted / blackout days (Epic 10.2): block when the requested range hits one.
  for (const r of input.restricted ?? []) {
    if (rangesOverlap(input.startISO, input.endISO, r.startISO, r.endISO)) {
      errors.push(r.reason ? `Leave overlaps a restricted period: ${r.reason}.` : "Leave overlaps a restricted period.");
    }
  }

  if (allowanceDays > 0 && !canBook(input.available, allowanceDays)) {
    errors.push("This exceeds your available balance.");
  }

  // Notice period check — calendar days only, no working-day logic (story 26.2).
  if (input.todayISO != null && input.noticePeriodDays != null) {
    const earliestStartISO = toISO(addDays(parseISO(input.todayISO), input.noticePeriodDays));
    if (input.startISO < earliestStartISO) {
      if (input.noticePeriodDays >= 0) {
        errors.push(`This leave type needs at least ${input.noticePeriodDays} day(s) notice.`);
      } else {
        errors.push(`This leave type can't be booked more than ${Math.abs(input.noticePeriodDays)} day(s) in the past.`);
      }
    }
  }

  if (input.noteRequired && !input.note?.trim()) {
    errors.push("A note is required for this leave type.");
  }

  const needsDoc =
    !!input.attachmentRequired &&
    (input.attachmentThresholdDays == null || workingDays > input.attachmentThresholdDays);
  if (needsDoc && !input.hasAttachment) {
    errors.push("A supporting document is required.");
  }

  return { ok: errors.length === 0, errors, workingDays, freeDays, allowanceDays };
}
