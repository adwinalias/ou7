import "server-only"; // Epic 22.4: DB-backed approval I/O — server-only (types are imported via `import type`, which is erased).
// Approval workflow I/O (Epic 5.4). Lists the queue and applies a decision, routing the
// transition through the pure core/approvals state machine and debiting allowance only by
// flipping status to APPROVED (core/allowance then counts the days as taken — never a
// hand-written number). Every action is authorized server-side via core/authz.
import { type DecisionAction, decideLeave } from "@/core/approvals";
import { canApproveFor, isApprover, isHR } from "@/core/authz";
import type { Actor } from "@/core/types";
import { periodBalanceExcluding } from "./allowance";
import { recordAudit } from "./audit";
import { buildCoverageInput } from "./coverage";
import { db } from "./db";
import { notifier, resolveRecipients } from "./notify";
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

export type DecideResult =
  | { ok: true; warnings?: string[] }
  | { ok: false; errors: string[] };

export interface CompanyPendingItem extends PendingItem {
  departmentName: string | null;
  regionName: string;
  daysPending: number; // whole days since the request was created
}

/** Every PENDING request org-wide, with time-in-pending — for the HR company queue
 *  (Epic 9.6). Optional name / department filters. HR acts via the existing decide path. */
export async function listCompanyPending(opts: { name?: string; departmentId?: string; employeeId?: string } = {}): Promise<CompanyPendingItem[]> {
  const name = opts.name?.trim().toLowerCase() ?? "";
  const rows = await db.leaveRequest.findMany({
    where: {
      status: "PENDING",
      ...(opts.employeeId ? { employeeId: opts.employeeId } : {}),
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

export interface ApproverChainEntry {
  level: number; // 1-based: Level 1 is the lowest `order`
  name: string;
}

/** The employee's approval chain (Epic 19.8; ML4), ordered Level 1 → N by ApproverAssignment.order.
 *  Returns only the level + approver name — no notes or other sensitive data. Empty array when the
 *  employee has no approvers assigned. */
export async function getMyApprovers(employeeId: string): Promise<ApproverChainEntry[]> {
  const rows = await db.approverAssignment.findMany({
    where: { employeeId },
    orderBy: { order: "asc" },
    include: { approver: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((r, index) => ({
    level: index + 1,
    name: `${r.approver.firstName} ${r.approver.lastName}`.trim(),
  }));
}

/** Story 27.3: Email addresses of the employee's approver chain (for notification dispatch).
 *  Internal — not exported as a public API surface; callers in lib/ use this. */
export async function getMyApproverEmails(employeeId: string): Promise<string[]> {
  const rows = await db.approverAssignment.findMany({
    where: { employeeId },
    orderBy: { order: "asc" },
    include: { approver: { select: { email: true } } },
  });
  return rows.map((r) => r.approver.email);
}

/** The Prisma WHERE used for the approver's pending queue. SHARED between the list and the
 *  count so the dashboard tile (Epic 18.3) can never disagree with /approvals. Caller must
 *  first check isApprover(actor) — a non-approver has no queue (returns []/0). */
function pendingForApproverWhere(actor: Actor) {
  return {
    status: "PENDING" as const,
    // HR → everyone (but never their own); approver → only assigned, never their own.
    employeeId: isHR(actor) ? { not: actor.employeeId } : { in: actor.approverForIds, not: actor.employeeId },
  };
}

/** PENDING requests the actor may act on: HR → all (fallback); approver → assigned only;
 *  never the actor's own request. */
export async function listPendingForApprover(actor: Actor): Promise<PendingItem[]> {
  if (!isApprover(actor)) return [];

  const rows = await db.leaveRequest.findMany({
    where: pendingForApproverWhere(actor),
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

/** How many PENDING requests the actor would see at /approvals — EXACTLY the set
 *  listPendingForApprover returns (same WHERE, no rows fetched). For the dashboard tile
 *  (Epic 18.3). Non-approvers have no queue → 0. */
export async function countPendingForApprover(actor: Actor): Promise<number> {
  if (!isApprover(actor)) return 0;
  return db.leaveRequest.count({ where: pendingForApproverWhere(actor) });
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
  // Also load the fields needed for the advisory coverage check (done outside the tx).
  const pre = await db.leaveRequest.findUnique({
    where: { id: requestId },
    select: {
      employeeId: true,
      startDate: true,
      endDate: true,
      durationMode: true,
      employee: { select: { regionId: true } },
    },
  });
  if (!pre || !canApproveFor(actor, pre.employeeId)) {
    throw new AuthError(403, "You can't act on this request.");
  }

  // Build coverage input BEFORE the transaction: advisory read-only work, no lock needed.
  // Exclude this request itself so it isn't counted as "already absent" for its own approver.
  let coverageInput = null;
  if (action === "APPROVE") {
    try {
      const startISO = iso(pre.startDate);
      const endISO = iso(pre.endDate);
      const region = await db.region.findUniqueOrThrow({
        where: { id: pre.employee.regionId },
        select: { weekendDays: true },
      });
      const startYear = Number(startISO.slice(0, 4));
      const endYear = Number(endISO.slice(0, 4));
      const holidayRows = await db.holiday.findMany({
        where: { regionId: pre.employee.regionId, year: { gte: startYear, lte: endYear } },
        select: { date: true },
      });
      const cal = {
        weekendDays: region.weekendDays,
        holidays: new Set(holidayRows.map((h) => iso(h.date))),
      };
      coverageInput = await buildCoverageInput(
        pre.employeeId,
        startISO,
        endISO,
        pre.durationMode as "DAY" | "HALF" | "MULTI",
        cal,
        { excludeRequestId: requestId },
      );
    } catch (err) {
      // Coverage check is advisory — never let an error here block approval.
      console.error("[coverage] buildCoverageInput failed (non-fatal at approval):", err);
    }
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
      coverage: coverageInput ?? undefined,
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
    // ADR-0014: if a coverage breach occurred, record it on the LEAVE_APPROVE audit entry.
    // ponytail: the warning string already contains the day count; record it verbatim.
    const auditAfter: Record<string, unknown> = {
      status: decision.nextStatus,
      decisionComment: comment?.trim() || null,
      decidedBy: actor.employeeId,
    };
    if (decision.warnings.length > 0) {
      // ADR-0014: persist ALL breach warnings (both min-staffing and max-per-day can fire on the same day).
      auditAfter.coverageBreach = decision.warnings;
    }

    await recordAudit(tx, {
      actorId: actor.employeeId,
      action: action === "APPROVE" ? "LEAVE_APPROVE" : "LEAVE_DECLINE",
      entity: "LeaveRequest",
      entityId: requestId,
      before: { status: "PENDING" },
      after: auditAfter,
    });

    return { ok: true as const, status: decision.nextStatus, warnings: decision.warnings };
  });

  if (!outcome.ok) return outcome;

  // Story 27.3: resolve recipients from emailOnDecision and notify outside the transaction.
  // Best-effort: ALL of the recipient-fetch + dispatch is inside the try/catch so any DB or
  // transport error here is logged and never surfaces to the caller. The decision is already
  // committed at this point and must return ok: true regardless of notification failure.
  try {
    const full = await db.leaveRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        startDate: true,
        endDate: true,
        employee: { select: { email: true, firstName: true, lastName: true } },
        leaveType: { select: { name: true, emailOnDecision: true } },
      },
    });
    const approverEmailsResolved = await getMyApproverEmails(pre.employeeId);
    const to = resolveRecipients(full.leaveType.emailOnDecision, full.employee.email, approverEmailsResolved);
    await notifier.leaveDecided({
      to,
      requesterName: `${full.employee.firstName} ${full.employee.lastName}`.trim(),
      leaveTypeName: full.leaveType.name,
      startISO: iso(full.startDate),
      endISO: iso(full.endDate),
      status: outcome.status === "APPROVED" ? "APPROVED" : "DECLINED",
      comment: comment?.trim() || null,
    });
  } catch (err) {
    console.error("[notify] leaveDecided dispatch failed (non-fatal):", err);
  }

  return { ok: true, warnings: outcome.warnings };
}
