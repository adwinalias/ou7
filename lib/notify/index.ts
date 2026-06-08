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

export interface Notifier {
  leaveDecided(event: LeaveDecidedEvent): Promise<void>;
}

// Default no-op: logs so the intent is visible in dev/CI; sends nothing.
export const consoleNotifier: Notifier = {
  async leaveDecided(event) {
    console.info(
      `[notify] leave ${event.status} → ${event.to} (${event.leaveTypeName} ${event.startISO}…${event.endISO})`,
    );
  },
};

export const notifier: Notifier = consoleNotifier;
