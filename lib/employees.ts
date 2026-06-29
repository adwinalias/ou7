import "server-only"; // Epic 22.4: DB-backed HR CRUD — server-only (types are imported via `import type`, which is erased).
// Employee management (Epic 9.1). HR CRUD + bulk import + generating an allowance profile.
// The profile's OPENING is computed by the engine (core/allowance.proRataOpening) from the
// configured entitlement policy + joining date — never invented. If no policy exists for the
// employee's region/role, we STOP and flag (ADR-0008). All writes are audited (16.1).
import type { ApproverLevel, EmploymentType, Role } from "@prisma/client";
import { proRataOpening } from "@/core/allowance";
import { parseEmployeeImport } from "@/core/employee-import";
import { recordAudit } from "./audit";
import { getEntitlementPolicy } from "./config";
import { dubaiTodayISO } from "./dates";
import { db } from "./db";

const atUtc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toISO = (d: Date) => d.toISOString().slice(0, 10);

export interface EmployeeInput {
  email: string;
  firstName: string;
  lastName: string;
  regionId: string;
  departmentId?: string | null;
  managerId?: string | null;
  joiningISO: string;
  role: Role;
  approverLevel: ApproverLevel;
  employmentType: EmploymentType;
}

export async function createEmployee(actorId: string, input: EmployeeInput) {
  const emp = await db.employee.create({
    data: {
      email: input.email.trim().toLowerCase(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      regionId: input.regionId,
      departmentId: input.departmentId || null,
      managerId: input.managerId || null,
      joiningDate: atUtc(input.joiningISO),
      role: input.role,
      approverLevel: input.approverLevel,
      employmentType: input.employmentType,
    },
  });
  await recordAudit(db, { actorId, action: "EMPLOYEE_CREATE", entity: "Employee", entityId: emp.id, after: { email: emp.email, regionId: emp.regionId, role: emp.role } });
  return emp.id;
}

export interface EmployeeUpdate {
  firstName?: string;
  lastName?: string;
  regionId?: string;
  /** ISO date (YYYY-MM-DD) the region change becomes effective. Defaults to today (Asia/Dubai).
   *  Ignored when regionId is unchanged or not provided. */
  regionEffectiveFrom?: string;
  departmentId?: string | null;
  managerId?: string | null;
  joiningISO?: string;
  role?: Role;
  approverLevel?: ApproverLevel;
  employmentType?: EmploymentType;
}

export async function updateEmployee(actorId: string, employeeId: string, patch: EmployeeUpdate) {
  const before = await db.employee.findUniqueOrThrow({ where: { id: employeeId } });
  const data = {
    ...(patch.firstName !== undefined ? { firstName: patch.firstName.trim() } : {}),
    ...(patch.lastName !== undefined ? { lastName: patch.lastName.trim() } : {}),
    ...(patch.regionId !== undefined ? { regionId: patch.regionId } : {}),
    ...(patch.departmentId !== undefined ? { departmentId: patch.departmentId || null } : {}),
    ...(patch.managerId !== undefined ? { managerId: patch.managerId || null } : {}),
    ...(patch.joiningISO !== undefined ? { joiningDate: atUtc(patch.joiningISO) } : {}),
    ...(patch.role !== undefined ? { role: patch.role } : {}),
    ...(patch.approverLevel !== undefined ? { approverLevel: patch.approverLevel } : {}),
    ...(patch.employmentType !== undefined ? { employmentType: patch.employmentType } : {}),
  };

  const regionChanged = patch.regionId !== undefined && patch.regionId !== before.regionId;

  if (regionChanged) {
    // Atomic: update employee + create assignment row + audit in one transaction (ADR-0015).
    const effectiveISO = patch.regionEffectiveFrom ?? dubaiTodayISO();
    const effectiveFrom = atUtc(effectiveISO);
    await db.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: employeeId }, data });
      await tx.employeeRegionAssignment.create({
        data: { employeeId, regionId: patch.regionId!, effectiveFrom },
      });
      await recordAudit(tx, {
        actorId,
        action: "REGION_CHANGE",
        entity: "Employee",
        entityId: employeeId,
        before: { regionId: before.regionId },
        after: { regionId: patch.regionId, effectiveFrom: effectiveISO },
      });
      await recordAudit(tx, {
        actorId,
        action: "EMPLOYEE_UPDATE",
        entity: "Employee",
        entityId: employeeId,
        before: { regionId: before.regionId, role: before.role, approverLevel: before.approverLevel, departmentId: before.departmentId, joiningISO: toISO(before.joiningDate) },
        after: data,
      });
    });
  } else {
    await db.employee.update({ where: { id: employeeId }, data });
    await recordAudit(db, {
      actorId,
      action: "EMPLOYEE_UPDATE",
      entity: "Employee",
      entityId: employeeId,
      before: { regionId: before.regionId, role: before.role, approverLevel: before.approverLevel, departmentId: before.departmentId, joiningISO: toISO(before.joiningDate) },
      after: data,
    });
  }
}

/** Deactivate (offboard) — keep history; revoke access via status (Epic 2.5). */
export async function deactivateEmployee(actorId: string, employeeId: string) {
  const before = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { status: true } });
  await db.employee.update({ where: { id: employeeId }, data: { status: "INACTIVE" } });
  await recordAudit(db, { actorId, action: "EMPLOYEE_DEACTIVATE", entity: "Employee", entityId: employeeId, before, after: { status: "INACTIVE" } });
}

export type ProfileResult = { ok: true; periodId: string; opening: number } | { ok: false; error: string };

/**
 * Generate an allowance profile for `year`: opening = engine pro-rata of the configured
 * policy's annual days by joining date. STOPS if no policy is configured for the employee's
 * region/role (no invented numbers), or if an open period already exists.
 */
export async function generateAllowanceProfile(actorId: string, employeeId: string, year: number): Promise<ProfileResult> {
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { regionId: true, role: true, joiningDate: true } });
  const policy = await getEntitlementPolicy(emp.regionId, emp.role);
  if (!policy) {
    return { ok: false, error: "No entitlement policy is configured for this employee's region and role. Set it under Admin → Configuration first." };
  }
  if (await db.allowancePeriod.findFirst({ where: { employeeId, endDate: null } })) {
    return { ok: false, error: "Employee already has an open allowance period." };
  }

  const opening = proRataOpening(policy.annualDays, toISO(emp.joiningDate), `${year}-01-01`, `${year}-12-31`);
  const period = await db.allowancePeriod.create({
    data: { employeeId, regionId: emp.regionId, startDate: atUtc(`${year}-01-01`), opening, carryOver: 0 },
  });
  await recordAudit(db, {
    actorId,
    action: "ALLOWANCE_PROFILE_GENERATE",
    entity: "AllowancePeriod",
    entityId: period.id,
    after: { employeeId, year, opening, annualDays: policy.annualDays, joiningISO: toISO(emp.joiningDate) },
  });
  return { ok: true, periodId: period.id, opening };
}

export interface ImportSummary {
  created: number;
  errors: { line: number; message: string }[];
}

/** Bulk import employees from CSV text. Pure parse/validate in core; valid rows are created
 *  (role STAFF, full-time) and audited; invalid rows are reported, not created. */
export async function bulkImportEmployees(actorId: string, text: string): Promise<ImportSummary> {
  const regions = await db.region.findMany({ select: { id: true, name: true } });
  const regionByName = new Map(regions.map((r) => [r.name, r.id]));
  const { valid, errors } = parseEmployeeImport(text, [...regionByName.keys()]);

  let created = 0;
  const rowErrors = [...errors];
  for (const row of valid) {
    const exists = await db.employee.findUnique({ where: { email: row.email }, select: { id: true } });
    if (exists) {
      rowErrors.push({ line: row.line, message: `email already exists: ${row.email}` });
      continue;
    }
    await createEmployee(actorId, {
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      regionId: regionByName.get(row.regionName)!,
      joiningISO: row.joiningISO,
      role: "STAFF",
      approverLevel: "NONE",
      employmentType: "FULL_TIME",
    });
    created++;
  }
  await recordAudit(db, { actorId, action: "EMPLOYEE_BULK_IMPORT", entity: "Employee", after: { created, errorCount: rowErrors.length } });
  return { created, errors: rowErrors.sort((a, b) => a.line - b.line) };
}

export async function listEmployees() {
  const rows = await db.employee.findMany({
    orderBy: [{ status: "asc" }, { firstName: "asc" }],
    select: {
      id: true, firstName: true, lastName: true, email: true, role: true, status: true, joiningDate: true,
      region: { select: { name: true } }, department: { select: { name: true } },
      allowancePeriods: { where: { endDate: null }, select: { id: true } },
    },
  });
  return rows.map((e) => ({
    id: e.id,
    name: `${e.firstName} ${e.lastName}`.trim(),
    email: e.email,
    role: e.role,
    status: e.status,
    regionName: e.region.name,
    departmentName: e.department?.name ?? null,
    joiningISO: toISO(e.joiningDate),
    hasOpenPeriod: e.allowancePeriods.length > 0,
  }));
}
