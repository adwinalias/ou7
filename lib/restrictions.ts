// Staff-restriction model (story 29.1 / ADR-0014).
// A StaffRestriction records two employees who should not be off at the same time.
// Enforcement (29.2) — buildClashCounterparts — is added here.
import type { ClashCounterpart } from "@/core/leave";
import { toCsv } from "@/core/csv";
import type { ISODate } from "@/core/types";
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

/**
 * Story 29.2 — build the ClashCounterpart[] for a leave request.
 *
 * Finds all StaffRestriction rows involving the requester, applies the bidirectional rule
 * (a non-bidirectional restriction only constrains employeeA → not employeeB), then fetches
 * the counterparts' PENDING/APPROVED leave overlapping [startISO,endISO] in ONE query (no N+1).
 *
 * Returns name + date range only — never the leave type (visibility rule: ADR-0014).
 */
export async function buildClashCounterparts(
  requesterEmployeeId: string,
  startISO: ISODate,
  endISO: ISODate,
): Promise<ClashCounterpart[]> {
  // One query: all restrictions involving the requester.
  const restrictions = await db.staffRestriction.findMany({
    where: {
      OR: [{ employeeAId: requesterEmployeeId }, { employeeBId: requesterEmployeeId }],
    },
    select: {
      employeeAId: true,
      employeeBId: true,
      bidirectional: true,
      employeeA: { select: { id: true, firstName: true, lastName: true } },
      employeeB: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Determine which counterpart IDs actually constrain the requester.
  // Non-bidirectional = only constrains employeeA (requester must be A to be constrained).
  const counterpartIds: string[] = [];
  for (const r of restrictions) {
    if (r.employeeAId === requesterEmployeeId) {
      // Requester is A → always constrained (bidirectional or not).
      counterpartIds.push(r.employeeBId);
    } else {
      // Requester is B → constrained only when bidirectional.
      if (r.bidirectional) counterpartIds.push(r.employeeAId);
    }
  }

  if (counterpartIds.length === 0) return [];

  // Build a name map from the restriction rows we already have (no extra query).
  const nameMap = new Map<string, string>();
  for (const r of restrictions) {
    nameMap.set(r.employeeA.id, displayName(r.employeeA));
    nameMap.set(r.employeeB.id, displayName(r.employeeB));
  }

  // ONE query: overlapping PENDING/APPROVED leave for all counterparts.
  const overlapping = await db.leaveRequest.findMany({
    where: {
      employeeId: { in: counterpartIds },
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: new Date(`${endISO}T00:00:00.000Z`) },
      endDate: { gte: new Date(`${startISO}T00:00:00.000Z`) },
    },
    select: { employeeId: true, startDate: true, endDate: true },
  });

  // Map each overlapping row → ClashCounterpart (name only, no leave type).
  // Multiple overlapping rows for one counterpart = multiple entries; assessClash dedupes names.
  return overlapping.map((r) => ({
    name: nameMap.get(r.employeeId) ?? r.employeeId,
    startISO: r.startDate.toISOString().slice(0, 10) as ISODate,
    endISO: r.endDate.toISOString().slice(0, 10) as ISODate,
  }));
}

/** Story 29.3 — CSV export builder (pure; no I/O). */
export function buildStaffRestrictionsCsv(rows: StaffRestrictionRow[]): string {
  const header = ["Person A", "Person B", "Both ways", "Reason"];
  const body = rows.map((r) => [
    r.employeeAName,
    r.employeeBName,
    r.bidirectional ? "Yes" : "No",
    r.reason ?? "",
  ]);
  return toCsv([header, ...body]);
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
