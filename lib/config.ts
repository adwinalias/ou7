import "server-only"; // Epic 22.4: DB-backed HR config — server-only.
// Configuration hub (Epic 9.5). HR-editable "data not code": the entitlement/carry-over
// POLICY (per region × role — shipped EMPTY, numbers entered by HR), plus leave types,
// departments and tags. Every write is audited (Epic 16.1).
//
// Out of scope here (deferred — see OVERNIGHT-NOTES.md): branding + notification settings
// (need PRD §14 inputs / Epic 11) and multi-level approval routing (Epic 5.5).
import type { Role } from "@prisma/client";
import { recordAudit } from "./audit";
import { db } from "./db";

// ─── Entitlement / carry-over policy ─────────────────────────────────────────────
export interface PolicyInput {
  regionId: string;
  role: Role;
  annualDays: number;
  carryOverCapDays: number | null;
  carryOverExpiry: string | null; // "MM-DD" or null
}

export async function listEntitlementPolicies() {
  const rows = await db.entitlementPolicy.findMany({
    include: { region: { select: { name: true } } },
    orderBy: [{ region: { name: "asc" } }, { role: "asc" }],
  });
  return rows.map((p) => ({
    id: p.id,
    regionId: p.regionId,
    regionName: p.region.name,
    role: p.role,
    annualDays: p.annualDays,
    carryOverCapDays: p.carryOverCapDays,
    carryOverExpiry: p.carryOverExpiry,
  }));
}

/** The policy for a region × role, or null if HR hasn't configured one (9.1 must stop). */
export async function getEntitlementPolicy(regionId: string, role: Role) {
  return db.entitlementPolicy.findUnique({ where: { regionId_role: { regionId, role } } });
}

export async function upsertEntitlementPolicy(actorId: string, input: PolicyInput) {
  const before = await db.entitlementPolicy.findUnique({ where: { regionId_role: { regionId: input.regionId, role: input.role } } });
  const data = {
    annualDays: input.annualDays,
    carryOverCapDays: input.carryOverCapDays,
    carryOverExpiry: input.carryOverExpiry?.trim() || null,
  };
  const saved = await db.entitlementPolicy.upsert({
    where: { regionId_role: { regionId: input.regionId, role: input.role } },
    update: data,
    create: { regionId: input.regionId, role: input.role, ...data },
  });
  await recordAudit(db, {
    actorId,
    action: before ? "POLICY_UPDATE" : "POLICY_CREATE",
    entity: "EntitlementPolicy",
    entityId: saved.id,
    before: before ? { annualDays: before.annualDays, carryOverCapDays: before.carryOverCapDays, carryOverExpiry: before.carryOverExpiry } : undefined,
    after: { regionId: input.regionId, role: input.role, ...data },
  });
  return saved.id;
}

export async function deleteEntitlementPolicy(actorId: string, id: string) {
  const before = await db.entitlementPolicy.findUnique({ where: { id } });
  if (!before) return;
  await db.entitlementPolicy.delete({ where: { id } });
  await recordAudit(db, { actorId, action: "POLICY_DELETE", entity: "EntitlementPolicy", entityId: id, before: { regionId: before.regionId, role: before.role, annualDays: before.annualDays } });
}

// ─── Departments ─────────────────────────────────────────────────────────────────
export async function createDepartment(actorId: string, name: string) {
  const dept = await db.department.create({ data: { name: name.trim() } });
  await recordAudit(db, { actorId, action: "DEPARTMENT_CREATE", entity: "Department", entityId: dept.id, after: { name: dept.name } });
  return dept.id;
}

// ─── Tags ──────────────────────────────────────────────────────────────────────
export async function createTag(actorId: string, name: string) {
  const tag = await db.tag.create({ data: { name: name.trim() } });
  await recordAudit(db, { actorId, action: "TAG_CREATE", entity: "Tag", entityId: tag.id, after: { name: tag.name } });
  return tag.id;
}

// ─── Leave types (create + retire/reactivate + policy edit) ──────────────────────
export interface LeaveTypeInput {
  name: string;
  code: string;
  color: string;
  deductsAllowance: boolean;
  paid: boolean;
  noteRequired: boolean;
  requiresApproval?: boolean; // default true
  noticePeriodDays?: number; // default 0; negative = allow backdating
  cancellationWindowDays?: number; // default 0; calendar days before start owner must cancel by
  minLengthDays?: number | null; // null = no minimum
  maxConsecutiveDays?: number | null; // null = no maximum
}

/** Partial of the per-type policy fields HR may edit (extensible for later stories). */
export interface LeaveTypePolicyPatch {
  requiresApproval?: boolean;
  noticePeriodDays?: number;
  cancellationWindowDays?: number;
  minLengthDays?: number | null;
  maxConsecutiveDays?: number | null;
}

// ponytail: clamp a limit to ≥1, or null if ≤0/null/undefined (0 and negatives are no-limit)
function clampLimit(v: number | null | undefined): number | null {
  if (v == null || v <= 0) return null;
  return Math.floor(v);
}

export async function createLeaveType(actorId: string, input: LeaveTypeInput) {
  const lt = await db.leaveType.create({
    data: {
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      color: input.color,
      deductsAllowance: input.deductsAllowance,
      paid: input.paid,
      noteRequired: input.noteRequired,
      requiresApproval: input.requiresApproval ?? true,
      noticePeriodDays: input.noticePeriodDays ?? 0,
      cancellationWindowDays: Math.max(0, input.cancellationWindowDays ?? 0),
      minLengthDays: clampLimit(input.minLengthDays),
      maxConsecutiveDays: clampLimit(input.maxConsecutiveDays),
    },
  });
  await recordAudit(db, { actorId, action: "LEAVE_TYPE_CREATE", entity: "LeaveType", entityId: lt.id, after: { name: lt.name, code: lt.code, requiresApproval: lt.requiresApproval } });
  return lt.id;
}

/** Retire (deactivate) or reactivate a leave type — historical records keep their type. */
export async function setLeaveTypeActive(actorId: string, id: string, active: boolean) {
  const before = await db.leaveType.findUniqueOrThrow({ where: { id } });
  await db.leaveType.update({ where: { id }, data: { active } });
  await recordAudit(db, { actorId, action: active ? "LEAVE_TYPE_REACTIVATE" : "LEAVE_TYPE_RETIRE", entity: "LeaveType", entityId: id, before: { active: before.active }, after: { active } });
}

/** Update the per-type policy fields (requiresApproval, and future story additions). */
export async function updateLeaveTypePolicy(actorId: string, id: string, patch: LeaveTypePolicyPatch) {
  const before = await db.leaveType.findUniqueOrThrow({ where: { id } });
  const safePatch: LeaveTypePolicyPatch = {
    ...patch,
    ...(patch.cancellationWindowDays !== undefined ? { cancellationWindowDays: Math.max(0, patch.cancellationWindowDays) } : {}),
    // minLengthDays / maxConsecutiveDays: present-but-undefined means "not in this patch";
    // explicit null means "clear the limit"; positive int means "set the limit".
    ...(patch.minLengthDays !== undefined ? { minLengthDays: clampLimit(patch.minLengthDays) } : {}),
    ...(patch.maxConsecutiveDays !== undefined ? { maxConsecutiveDays: clampLimit(patch.maxConsecutiveDays) } : {}),
  };
  const updated = await db.leaveType.update({ where: { id }, data: safePatch });
  await recordAudit(db, {
    actorId,
    action: "LEAVE_TYPE_UPDATE",
    entity: "LeaveType",
    entityId: id,
    before: { requiresApproval: before.requiresApproval, noticePeriodDays: before.noticePeriodDays, cancellationWindowDays: before.cancellationWindowDays, minLengthDays: before.minLengthDays, maxConsecutiveDays: before.maxConsecutiveDays },
    after: safePatch,
  });
  return updated.id;
}

export async function listLeaveTypes() {
  return db.leaveType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true, color: true, active: true, deductsAllowance: true, requiresApproval: true, noticePeriodDays: true, cancellationWindowDays: true, minLengthDays: true, maxConsecutiveDays: true } });
}
