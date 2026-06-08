// Leave request validation — composes the calendar + allowance engine + policy rules.
// Pure: returns errors; performs no I/O. The API layer fetches data and calls this.
import { canBook } from "../allowance";
import { countDays } from "../calendar";
import { rangesOverlap } from "../dates";
import type { DateRange, DurationMode, ISODate, RegionCalendar } from "../types";

export interface LeaveValidationInput {
  startISO: ISODate;
  endISO: ISODate;
  mode: DurationMode;
  cal: RegionCalendar;
  deductsAllowance: boolean;
  available: number;
  existing: DateRange[]; // the employee's current approved/pending ranges
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
