// Staff-restriction model (story 29.1 / ADR-0014).
// A StaffRestriction records two employees who should not be off at the same time.
// Enforcement (29.2) is a separate story — this module is model + CRUD only.
import { recordAudit } from "./audit";
import { db } from "./db";

export interface StaffRestrictionRow {
  id: string;
  employeeAId: string;
  employeeAName: string;
  employeeBId: string;
  employeeBName: string;
  bidirectional: boolean;
  reason: string | null;
}

const displayName = (e: { firstName: string; lastName: string }) =>
  `${e.firstName} ${e.lastName}`.trim();

export async function listStaffRestrictions(): Promise<StaffRestrictionRow[]> {
  const rows = await db.staffRestriction.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      employeeA: { select: { id: true, firstName: true, lastName: true } },
      employeeB: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    employeeAId: r.employeeAId,
    employeeAName: displayName(r.employeeA),
    employeeBId: r.employeeBId,
    employeeBName: displayName(r.employeeB),
    bidirectional: r.bidirectional,
    reason: r.reason,
  }));
}

export async function createStaffRestriction(
  actorId: string,
  input: { employeeAId: string; employeeBId: string; bidirectional: boolean; reason?: string },
): Promise<string> {
  if (input.employeeAId === input.employeeBId) {
    throw new Error("A staff restriction cannot pair an employee with themselves.");
  }

  // Reject duplicates in EITHER direction — the unique index only covers (A,B).
  const existing = await db.staffRestriction.findFirst({
    where: {
      OR: [
        { employeeAId: input.employeeAId, employeeBId: input.employeeBId },
        { employeeAId: input.employeeBId, employeeBId: input.employeeAId },
      ],
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error("A restriction between these two employees already exists.");
  }

  const row = await db.staffRestriction.create({
    data: {
      employeeAId: input.employeeAId,
      employeeBId: input.employeeBId,
      bidirectional: input.bidirectional,
      reason: input.reason?.trim() || null,
    },
  });

  await recordAudit(db, {
    actorId,
    action: "STAFF_RESTRICTION_CREATE",
    entity: "StaffRestriction",
    entityId: row.id,
    after: { employeeAId: input.employeeAId, employeeBId: input.employeeBId, bidirectional: input.bidirectional, reason: row.reason },
  });

  return row.id;
}

export async function deleteStaffRestriction(actorId: string, id: string): Promise<void> {
  const row = await db.staffRestriction.findUnique({ where: { id } });
  if (!row) return;

  await db.staffRestriction.delete({ where: { id } });

  await recordAudit(db, {
    actorId,
    action: "STAFF_RESTRICTION_DELETE",
    entity: "StaffRestriction",
    entityId: id,
    before: { employeeAId: row.employeeAId, employeeBId: row.employeeBId, bidirectional: row.bidirectional, reason: row.reason },
  });
}
