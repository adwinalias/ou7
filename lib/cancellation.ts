// Cancellation (Epic 5.6). Authorizes server-side (owner vs HR), routes the decision through
// the pure core/cancellation rule, and flips status → CANCELLED in a transaction with a
// CONDITIONAL update (only while still cancellable) + audit. The allowance returns
// AUTOMATICALLY: once the request is no longer APPROVED, core/allowance stops counting its
// days as taken — never hand-written.
import { isHR } from "@/core/authz";
import { canCancel } from "@/core/cancellation";
import type { Actor, ISODate, LeaveStatus } from "@/core/types";
import { recordAudit } from "./audit";
import { db } from "./db";
import { AuthError } from "./rbac";

function dubaiToday(): ISODate {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

export type CancelResult = { ok: true } | { ok: false; error: string };

export async function cancelLeaveRequest(actor: Actor, requestId: string): Promise<CancelResult> {
  const req = await db.leaveRequest.findUnique({ where: { id: requestId }, select: { status: true, employeeId: true, startDate: true } });
  if (!req) throw new AuthError(403, "You can't act on this request.");

  const isOwner = actor.employeeId === req.employeeId;
  const hr = isHR(actor);
  if (!isOwner && !hr) throw new AuthError(403, "You can't cancel this request."); // 403: no business here

  const decision = canCancel({
    status: req.status as LeaveStatus,
    isOwner,
    isHR: hr,
    todayISO: dubaiToday(),
    startISO: req.startDate.toISOString().slice(0, 10),
  });
  if (!decision.allowed) return { ok: false, error: decision.reason ?? "Cannot cancel." };

  return db.$transaction(async (tx) => {
    // Conditional: only transition while still PENDING/APPROVED (guards a race).
    const updated = await tx.leaveRequest.updateMany({
      where: { id: requestId, status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "CANCELLED" },
    });
    if (updated.count === 0) return { ok: false as const, error: "This request can no longer be cancelled." };
    await recordAudit(tx, {
      actorId: actor.employeeId,
      action: "LEAVE_CANCEL",
      entity: "LeaveRequest",
      entityId: requestId,
      before: { status: req.status },
      after: { status: "CANCELLED", by: hr && !isOwner ? "HR" : "owner" },
    });
    return { ok: true as const };
  });
}
