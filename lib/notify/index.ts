// Notification boundary (interface + a no-op/log implementation). Real email + Teams
// delivery, per-user format, and Notification-row persistence are Epic 11 — they slot in
// behind this same interface without touching callers. lib/approvals depends only on the
// interface, never on a transport.

export interface LeaveDecidedEvent {
  to: string; // requester email
  requesterName: string;
  leaveTypeName: string;
  startISO: string;
  endISO: string;
  status: "APPROVED" | "DECLINED";
  comment?: string | null;
}

export interface LeaveReminderEvent {
  to: string; // approver (placeholder = requester until Epic 11 routes to the approver)
  requesterName: string;
  leaveTypeName: string;
  startISO: string;
}

export interface Notifier {
  leaveDecided(event: LeaveDecidedEvent): Promise<void>;
  leaveReminder(event: LeaveReminderEvent): Promise<void>;
}

// Default no-op: logs so the intent is visible in dev/CI; sends nothing.
export const consoleNotifier: Notifier = {
  async leaveDecided(event) {
    console.info(
      `[notify] leave ${event.status} → ${event.to} (${event.leaveTypeName} ${event.startISO}…${event.endISO})`,
    );
  },
  async leaveReminder(event) {
    console.info(`[notify] reminder for ${event.requesterName}'s ${event.leaveTypeName} (${event.startISO}) → ${event.to}`);
  },
};

export const notifier: Notifier = consoleNotifier;
