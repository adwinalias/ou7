// Leave request validation — composes the calendar + allowance engine + policy rules.
// Pure: returns errors; performs no I/O. The API layer fetches data and calls this.
import { canBook } from "../allowance";
import { countDays } from "../calendar";
import { rangesOverlap } from "../dates";
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
