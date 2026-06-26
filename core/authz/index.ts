// RBAC policy — pure, deterministic, exhaustively tested. No I/O, no DB, no AI.
// lib/rbac resolves an Actor from the session + DB, then asks these predicates.
//
// Model: ROLE is the primary gate (Staff / Approver / HR). APPROVER LEVEL grades the
// extra "act on others' leave" powers. HR is the universal fallback — it can do
// anything an approver can, for anyone. An INACTIVE actor can do nothing.
import type { Actor, ApproverLevel } from "../types";

const LEVEL_RANK: Record<ApproverLevel, number> = {
  NONE: 0,
  APPROVER: 1,
  APPROVER_ADD: 2,
  APPROVER_ADD_EDIT: 3,
};

export function isActive(actor: Actor): boolean {
  return actor.status === "ACTIVE";
}

export function isHR(actor: Actor): boolean {
  return isActive(actor) && actor.role === "HR";
}

/** Can act on approvals at all (approve/decline). HR is always an approver (fallback). */
export function isApprover(actor: Actor): boolean {
  return isActive(actor) && (actor.role === "APPROVER" || actor.role === "HR");
}

/** Approver level meets at least the given rung (HR is treated as the top rung). */
export function hasApproverLevel(actor: Actor, min: ApproverLevel): boolean {
  if (!isActive(actor)) return false;
  if (actor.role === "HR") return true;
  return LEVEL_RANK[actor.approverLevel] >= LEVEL_RANK[min];
}

/**
 * Can this actor approve/decline a specific employee's request?
 * HR → anyone. Approver → only employees they're assigned to. Never your own leave.
 */
export function canApproveFor(actor: Actor, employeeId: string): boolean {
  if (!isApprover(actor)) return false;
  if (actor.employeeId === employeeId) return false;
  if (isHR(actor)) return true;
  return actor.approverForIds.includes(employeeId);
}

/** Add leave on behalf of others (Epic 2.4 "+Add Leave"; HR always can). */
export function canAddLeaveForOthers(actor: Actor): boolean {
  return hasApproverLevel(actor, "APPROVER_ADD");
}

/** Edit/cancel others' leave (Epic 2.4 "+Add+Edit/Cancel"; HR always can). */
export function canEditOthersLeave(actor: Actor): boolean {
  return hasApproverLevel(actor, "APPROVER_ADD_EDIT");
}

/** HR-only consoles and configuration (Epic 9). */
export function canAccessAdmin(actor: Actor): boolean {
  return isHR(actor);
}

/** Generic role gate used by route/page guards. */
export function hasRole(actor: Actor, role: Actor["role"]): boolean {
  return isActive(actor) && actor.role === role;
}

// ─── Per-leave-type visibility (story 27.1) ──────────────────────────────────
export type LeaveTypeVisibility = "EVERYONE" | "APPROVERS_SUPERUSERS" | "HR_ONLY";

/** Can this actor see bookings whose leave type has the given visibility setting?
 *  Staff always see their OWN leave — that override is handled at the call site. */
export function canSeeLeaveTypeVisibility(actor: Actor, visibility: LeaveTypeVisibility): boolean {
  if (visibility === "EVERYONE") return true;
  if (visibility === "APPROVERS_SUPERUSERS") return isApprover(actor); // isApprover includes HR
  return isHR(actor); // HR_ONLY
}

/** All visibility values this actor may see — useful for building a Prisma `in` filter. */
export function allowedLeaveTypeVisibilities(actor: Actor): LeaveTypeVisibility[] {
  return (["EVERYONE", "APPROVERS_SUPERUSERS", "HR_ONLY"] as LeaveTypeVisibility[]).filter(
    (v) => canSeeLeaveTypeVisibility(actor, v),
  );
}
