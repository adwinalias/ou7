// Cancellation decision (Epic 5.6). Pure: given role/ownership, status and Dubai dates,
// decide whether a leave request may be cancelled. No I/O. lib/cancellation supplies the
// Dubai "today" and persists the transition.
//
// Locked rules:
//  - Only PENDING or APPROVED can be cancelled.
//  - A staff member may self-cancel their OWN PENDING request while today (Dubai) is BEFORE
//    the start date (never on/after the start day).
//  - Cancelling an APPROVED request, or any on/after-start-day cancellation, requires HR.
import { addDays, parseISO, toISO } from "../dates";
import type { ISODate, LeaveStatus } from "../types";

export interface CancelInput {
  status: LeaveStatus;
  isOwner: boolean;
  isHR: boolean;
  todayISO: ISODate; // Asia/Dubai today
  startISO: ISODate; // request start date
  /** Calendar days before start that an owner must cancel by. Default 0 = existing ADR-0011 behaviour. */
  cancellationWindowDays?: number;
}

export interface CancelDecision {
  allowed: boolean;
  reason?: string;
}

export function canCancel(input: CancelInput): CancelDecision {
  if (input.status !== "PENDING" && input.status !== "APPROVED") {
    return { allowed: false, reason: "Only pending or approved leave can be cancelled." };
  }

  // HR may cancel any cancellable request, before or after the start day.
  if (input.isHR) return { allowed: true };

  if (!input.isOwner) {
    return { allowed: false, reason: "You can only cancel your own leave." };
  }

  // Owner (non-HR): self-cancel limited to a PENDING request, strictly before the start day.
  if (input.status !== "PENDING") {
    return { allowed: false, reason: "Approved leave can only be cancelled by HR." };
  }
  const windowDays = input.cancellationWindowDays ?? 0;
  const cutoffISO = windowDays > 0
    ? toISO(addDays(parseISO(input.startISO), -windowDays))
    : input.startISO;
  if (input.todayISO >= cutoffISO) {
    const reason = windowDays > 0
      ? `You must cancel at least ${windowDays} day(s) before the start — contact HR.`
      : "You can't cancel on or after the start day — contact HR.";
    return { allowed: false, reason };
  }
  return { allowed: true };
}
