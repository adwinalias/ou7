// Approval workflow I/O (Epic 5.4). Lists the queue and applies a decision, routing the
// transition through the pure core/approvals state machine and debiting allowance only by
// flipping status to APPROVED (core/allowance then counts the days as taken — never a
// hand-written number). Every action is authorized server-side via core/authz.
import { type DecisionAction, decideLeave } from "@/core/approvals";
import { canApproveFor, isApprover, isHR } from "@/core/authz";
import type { Actor } from "@/core/types";
import { periodBalanceExcluding } from "./allowance";
import { recordAudit } from "./audit";
import { db } from "./db";
import { notifier } from "./notify";
import { AuthError } from "./rbac";

export interface PendingItem {
  id: string;
  requesterName: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  code: string;
  startISO: string;
  endISO: string;
  durationMode: string;
  workingDays: number;
  allowanceDays: number;
  deductsAllowance: boolean;
  notes: string | null;
}

export type DecideResult = { ok: true } | { ok: false; errors: string[] };

export interface CompanyPendingItem extends PendingItem {
  departmentName: string | null;
  regionName: string;
  daysPending: number; // whole days since the request was created
}

/** Every PENDING request org-wide, with time-in-pending — for the HR company queue
 *  (Epic 9.6). Optional name / department filters. HR acts via the existing decide path. */
export async function listCompanyPending(opts: { name?: string; departmentId?: string } = {}): Promise<CompanyPendingItem[]> {
  const name = opts.name?.trim().toLowerCase() ?? "";
  const rows = await db.leaveRequest.findMany({
    where: {
      status: "PENDING",
      ...(opts.departmentId ? { employee: { departmentId: opts.departmentId } } : {}),
    },
    include: { employee: { select: { firstName: true, lastName: true, department: { select: { name: true } }, region: { select: { name: true } } } }, leaveType: true },
    orderBy: { createdAt: "asc" },
  });
  const nowMs = Date.now();
  return rows
    .map((r) => ({
      id: r.id,
      requesterName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
      leaveTypeName: r.leaveType.name,
      leaveTypeColor: r.leaveType.color,
      code: r.leaveType.code,
      startISO: iso(r.startDate),
      endISO: iso(r.endDate),
      durationMode: r.durationMode,
      workingDays: r.workingDays,
      allowanceDays: r.allowanceDays,
      deductsAllowance: r.leaveType.deductsAllowance,
      notes: r.notes,
      departmentName: r.employee.department?.name ?? null,
      regionName: r.employee.region.name,
      daysPending: Math.max(0, Math.floor((nowMs - r.createdAt.getTime()) / 86_400_000)),
    }))
    .filter((r) => !name || r.requesterName.toLowerCase().includes(name));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** PENDING requests the actor may act on: HR → all (fallback); approver → assigned only;
 *  never the actor's own request. */
export async function listPendingForApprover(actor: Actor): Promise<PendingItem[]> {
  if (!isApprover(actor)) return [];

  const rows = await db.leaveRequest.findMany({
    where: {
      status: "PENDING",
      employeeId: isHR(actor) ? { not: actor.employeeId } : { in: actor.approverForIds, not: actor.employeeId },
    },
    include: { employee: true, leaveType: true },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    requesterName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
    leaveTypeName: r.leaveType.name,
    leaveTypeColor: r.leaveType.color,
    code: r.leaveType.code,
    startISO: iso(r.startDate),
    endISO: iso(r.endDate),
    durationMode: r.durationMode,
    workingDays: r.workingDays,
    allowanceDays: r.allowanceDays,
    deductsAllowance: r.leaveType.deductsAllowance,
    notes: r.notes,
  }));
}

/**
 * Approve or decline a request. Authorizes per-record, then runs load→decide→save in ONE
 * transaction: the allowance period row is locked (SELECT … FOR UPDATE) so concurrent
 * approvals serialize and can't both pass the over-booking check, and the write is a
 * conditional update that only fires while the request is still PENDING (so a racing
 * decision can't double-apply).
 */
export async function decideLeaveRequest(
  actor: Actor,
  requestId: string,
  action: DecisionAction,
  comment?: string,
): Promise<DecideResult> {
  // Authorize first (don't leak existence): only the assigned approver or HR may act.
  const pre = await db.leaveRequest.findUnique({ where: { id: requestId }, select: { employeeId: true } });
  if (!pre || !canApproveFor(actor, pre.employeeId)) {
    throw new AuthError(403, "You can't act on this request.");
  }

  const outcome = await db.$transaction(async (tx) => {
    const req = await tx.leaveRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        status: true,
        allowanceDays: true,
        allowancePeriodId: true,
        leaveType: { select: { deductsAllowance: true } },
      },
    });
    if (req.status !== "PENDING") {
      return { ok: false as const, errors: ["This request has already been decided."] };
    }

    const deductsAllowance = req.leaveType.deductsAllowance;
    let remainingExclR = 0;
    let otherPending = 0;
    if (action === "APPROVE" && deductsAllowance && req.allowancePeriodId) {
      // Lock the period so a concurrent approval on the same balance waits for us.
      await tx.$queryRaw`SELECT id FROM "AllowancePeriod" WHERE id = ${req.allowancePeriodId} FOR UPDATE`;
      ({ remainingExclR, otherPending } = await periodBalanceExcluding(tx, req.allowancePeriodId, requestId));
    }

    const decision = decideLeave({
      currentStatus: req.status,
      action,
      reason: comment,
      deductsAllowance,
      allowanceDays: req.allowanceDays,
      remainingExclR,
      otherPending,
    });
    if (!decision.ok || !decision.nextStatus) {
      return { ok: false as const, errors: decision.errors };
    }

    // Conditional write: only transition while still PENDING (guards against a race that
    // committed between our read and here). Debits allowance purely via the status change.
    const updated = await tx.leaveRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: {
        status: decision.nextStatus,
        decisionById: actor.employeeId,
        decisionComment: comment?.trim() || null,
        decisionAt: new Date(),
      },
    });
    if (updated.count === 0) {
      return { ok: false as const, errors: ["This request has already been decided."] };
    }

    // Audit the decision atomically with the write (Epic 16.1).
    await recordAudit(tx, {
      actorId: actor.employeeId,
      action: action === "APPROVE" ? "LEAVE_APPROVE" : "LEAVE_DECLINE",
      entity: "LeaveRequest",
      entityId: requestId,
      before: { status: "PENDING" },
      after: { status: decision.nextStatus, decisionComment: comment?.trim() || null, decidedBy: actor.employeeId },
    });

    return { ok: true as const, status: decision.nextStatus };
  });

  if (!outcome.ok) return outcome;

  // Notify the requester outside the transaction (no-op/log for now — Epic 11).
  const full = await db.leaveRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { startDate: true, endDate: true, employee: true, leaveType: { select: { name: true } } },
  });
  await notifier.leaveDecided({
    to: full.employee.email,
    requesterName: `${full.employee.firstName} ${full.employee.lastName}`.trim(),
    leaveTypeName: full.leaveType.name,
    startISO: iso(full.startDate),
    endISO: iso(full.endDate),
    status: outcome.status === "APPROVED" ? "APPROVED" : "DECLINED",
    comment: comment?.trim() || null,
  });

  return { ok: true };
}
