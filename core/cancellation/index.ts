// Cancellation decision (Epic 5.6). Pure: given role/ownership, status and Dubai dates,
// decide whether a leave request may be cancelled. No I/O. lib/cancellation supplies the
// Dubai "today" and persists the transition.
//
// Locked rules:
//  - Only PENDING or APPROVED can be cancelled.
//  - A staff member may self-cancel their OWN PENDING request while today (Dubai) is BEFORE
//    the start date (never on/after the start day).
//  - Cancelling an APPROVED request, or any on/after-start-day cancellation, requires HR.
import type { ISODate, LeaveStatus } from "../types";

export interface CancelInput {
  status: LeaveStatus;
  isOwner: boolean;
  isHR: boolean;
  todayISO: ISODate; // Asia/Dubai today
  startISO: ISODate; // request start date
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
  if (input.todayISO >= input.startISO) {
    return { allowed: false, reason: "You can't cancel on or after the start day — contact HR." };
  }
  return { allowed: true };
}
