// Send reminder (Epic 5.7 / 7.2). A nudge on a PENDING request: increments the follow-up
// count, fires the (no-op) notifier, and audits — owner or HR only. No balance impact.
import { isHR } from "@/core/authz";
import type { Actor } from "@/core/types";
import { recordAudit } from "./audit";
import { db } from "./db";
import { notifier } from "./notify";
import { AuthError } from "./rbac";

export type ReminderResult = { ok: true; followUpCount: number } | { ok: false; error: string };

export async function sendReminder(actor: Actor, requestId: string): Promise<ReminderResult> {
  const req = await db.leaveRequest.findUnique({
    where: { id: requestId },
    select: { status: true, employeeId: true, startDate: true, employee: { select: { firstName: true, lastName: true, email: true } }, leaveType: { select: { name: true } } },
  });
  if (!req) throw new AuthError(403, "You can't act on this request.");
  if (actor.employeeId !== req.employeeId && !isHR(actor)) throw new AuthError(403, "You can't remind on this request.");
  if (req.status !== "PENDING") return { ok: false, error: "Only pending requests can be reminded." };

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.leaveRequest.update({ where: { id: requestId }, data: { followUpCount: { increment: 1 } }, select: { followUpCount: true } });
    await recordAudit(tx, { actorId: actor.employeeId, action: "LEAVE_REMINDER", entity: "LeaveRequest", entityId: requestId, after: { followUpCount: row.followUpCount } });
    return row;
  });

  // No-op for now (Epic 11 routes to the approver); placeholder recipient = requester.
  await notifier.leaveReminder({
    to: req.employee.email,
    requesterName: `${req.employee.firstName} ${req.employee.lastName}`.trim(),
    leaveTypeName: req.leaveType.name,
    startISO: req.startDate.toISOString().slice(0, 10),
  });

  return { ok: true, followUpCount: updated.followUpCount };
}
