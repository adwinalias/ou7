import "server-only"; // DB I/O — server-only (ADR-0015, story 30.2).
// "Region on date D" resolution via the EmployeeRegionAssignment history.
// Employee.regionId is the current-region cache; this module gives the effective
// region for any arbitrary date, used by previewLeave/submitLeave and the wall chart.
import { regionOnDate } from "@/core/region";
import type { ISODate } from "@/core/types";
import { db } from "./db";

const toISO = (d: Date): ISODate => d.toISOString().slice(0, 10);

/**
 * The regionId effective for a single employee on `dateISO`.
 * Falls back to Employee.regionId (the cache) if no assignment row pre-dates D.
 * One query.
 */
export async function regionIdOnDate(employeeId: string, dateISO: ISODate): Promise<string> {
  const [assignments, emp] = await Promise.all([
    db.employeeRegionAssignment.findMany({
      where: { employeeId },
      select: { regionId: true, effectiveFrom: true },
      // Secondary key ensures a deterministic tie-break when two moves share the same
      // effectiveFrom: createdAt asc → last-created wins (core/regionOnDate last-in-order wins).
      orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
    }),
    db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { regionId: true } }),
  ]);
  const resolved = regionOnDate(
    assignments.map((a) => ({ regionId: a.regionId, effectiveFromISO: toISO(a.effectiveFrom) })),
    dateISO,
  );
  return resolved ?? emp.regionId;
}

/**
 * Batch-load region assignments for a list of employee IDs. Returns a map of
 * employeeId → { assignments[], fallbackRegionId } for in-memory resolution.
 * One query. Used by the wall chart to avoid N+1 when resolving per-employee
 * effective regions at the month's start.
 */
export async function batchRegionAssignments(employeeIds: string[]): Promise<
  Map<string, { assignments: { regionId: string; effectiveFromISO: ISODate }[]; fallbackRegionId: string }>
> {
  if (employeeIds.length === 0) return new Map();

  const [rows, emps] = await Promise.all([
    db.employeeRegionAssignment.findMany({
      where: { employeeId: { in: employeeIds } },
      select: { employeeId: true, regionId: true, effectiveFrom: true },
      // Same secondary key as the single-employee query for consistent tie-break semantics.
      orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
    }),
    db.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, regionId: true },
    }),
  ]);

  const fallbackById = new Map(emps.map((e) => [e.id, e.regionId]));
  const out = new Map<string, { assignments: { regionId: string; effectiveFromISO: ISODate }[]; fallbackRegionId: string }>();

  for (const id of employeeIds) {
    out.set(id, { assignments: [], fallbackRegionId: fallbackById.get(id) ?? "" });
  }
  for (const r of rows) {
    out.get(r.employeeId)?.assignments.push({ regionId: r.regionId, effectiveFromISO: toISO(r.effectiveFrom) });
  }
  return out;
}
