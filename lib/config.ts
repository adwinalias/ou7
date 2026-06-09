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

// ─── Leave types (create + retire/reactivate) ────────────────────────────────────
export interface LeaveTypeInput {
  name: string;
  code: string;
  color: string;
  deductsAllowance: boolean;
  paid: boolean;
  noteRequired: boolean;
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
    },
  });
  await recordAudit(db, { actorId, action: "LEAVE_TYPE_CREATE", entity: "LeaveType", entityId: lt.id, after: { name: lt.name, code: lt.code } });
  return lt.id;
}

/** Retire (deactivate) or reactivate a leave type — historical records keep their type. */
export async function setLeaveTypeActive(actorId: string, id: string, active: boolean) {
  const before = await db.leaveType.findUniqueOrThrow({ where: { id } });
  await db.leaveType.update({ where: { id }, data: { active } });
  await recordAudit(db, { actorId, action: active ? "LEAVE_TYPE_REACTIVATE" : "LEAVE_TYPE_RETIRE", entity: "LeaveType", entityId: id, before: { active: before.active }, after: { active } });
}

export async function listLeaveTypes() {
  return db.leaveType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true, color: true, active: true, deductsAllowance: true } });
}
