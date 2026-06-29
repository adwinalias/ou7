// Notification boundary (interface + a no-op/log implementation). Real email + Teams
// delivery, per-user format, and Notification-row persistence are Epic 11 — they slot in
// behind this same interface without touching callers. lib/approvals depends only on the
// interface, never on a transport.
//
// Story 27.3: added leaveRequested + leaveCancelled events, and resolveRecipients helper.
// NOTE: OU7 has no distinct "notifier" role. WhosOff's "staff, approver & notifier"
// variant collapses to STAFF_AND_APPROVER because the only modelled parties are the
// requester (STAFF) and their approver chain. Future work: add a notifier-role model.

import type { EmailRecipients } from "@prisma/client";

export interface LeaveDecidedEvent {
  to: string[]; // recipient email list (resolved by caller from emailOnDecision)
  requesterName: string;
  leaveTypeName: string;
  startISO: string;
  endISO: string;
  status: "APPROVED" | "DECLINED";
  comment?: string | null;
}

export interface LeaveRequestedEvent {
  to: string[]; // recipient email list (resolved by caller from emailOnRequest)
  requesterName: string;
  leaveTypeName: string;
  startISO: string;
  endISO: string;
}

export interface LeaveCancelledEvent {
  to: string[]; // recipient email list (resolved by caller from emailOnCancellation)
  requesterName: string;
  leaveTypeName: string;
  startISO: string;
  endISO: string;
}

export interface LeaveReminderEvent {
  to: string; // approver (placeholder = requester until Epic 11 routes to the approver)
  requesterName: string;
  leaveTypeName: string;
  startISO: string;
}

export interface Notifier {
  leaveDecided(event: LeaveDecidedEvent): Promise<void>;
  leaveRequested(event: LeaveRequestedEvent): Promise<void>;
  leaveCancelled(event: LeaveCancelledEvent): Promise<void>;
  leaveReminder(event: LeaveReminderEvent): Promise<void>;
}

// Default no-op: logs so the intent is visible in dev/CI; sends nothing.
export const consoleNotifier: Notifier = {
  async leaveDecided(event) {
    if (event.to.length === 0) return;
    console.info(
      `[notify] leave ${event.status} → ${event.to.join(", ")} (${event.leaveTypeName} ${event.startISO}…${event.endISO})`,
    );
  },
  async leaveRequested(event) {
    if (event.to.length === 0) return;
    console.info(
      `[notify] leave requested → ${event.to.join(", ")} (${event.leaveTypeName} ${event.startISO}…${event.endISO})`,
    );
  },
  async leaveCancelled(event) {
    if (event.to.length === 0) return;
    console.info(
      `[notify] leave cancelled → ${event.to.join(", ")} (${event.leaveTypeName} ${event.startISO}…${event.endISO})`,
    );
  },
  async leaveReminder(event) {
    console.info(`[notify] reminder for ${event.requesterName}'s ${event.leaveTypeName} (${event.startISO}) → ${event.to}`);
  },
};

export const notifier: Notifier = consoleNotifier;

/**
 * Resolve the email recipient list from the per-type setting, the requester's email,
 * and their approver email(s). Pure: no I/O.
 *
 * NONE → []
 * STAFF → [requesterEmail]
 * APPROVER → approverEmails (may be empty if no approvers assigned)
 * STAFF_AND_APPROVER → [requesterEmail, ...approverEmails] (deduped)
 */
export function resolveRecipients(
  setting: EmailRecipients,
  requesterEmail: string,
  approverEmails: string[],
): string[] {
  switch (setting) {
    case "NONE":
      return [];
    case "STAFF":
      return [requesterEmail];
    case "APPROVER":
      return [...approverEmails];
    case "STAFF_AND_APPROVER":
      // dedupe in case requester is also an approver (edge: self-approval config)
      return [...new Set([requesterEmail, ...approverEmails])];
  }
}
