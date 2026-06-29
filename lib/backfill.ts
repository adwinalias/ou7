import "server-only";
// ADR-0015: day-counts (workingDays, freeDays, allowanceDays) are snapshotted at request
// creation and NEVER recomputed for an existing request. All balance math reads the stored
// values — lib/allowance sums LeaveRequest.allowanceDays; nothing recomputes them.
// This backfill is a one-time safety net for legacy/import rows where the snapshot was never
// written (workingDays === 0). It MUST NOT be called from any hot path.
// ponytail: invoke manually before go-live (Epic 33) or after a WhosOff import (Epic 33).
import { countDays } from "@/core/calendar";
import type { ISODate } from "@/core/types";
import { db } from "./db";
import { buildRegionCalendar } from "./region";

/**
 * Idempotent backfill: find PENDING/APPROVED LeaveRequests with workingDays === 0
 * (legacy/import rows where the snapshot was never written), recompute their day-counts
 * against the employee's current region calendar + the type's deductsAllowance flag,
 * and update the row. Rows with workingDays > 0 are never touched.
 *
 * Returns the count of rows updated. Safe to run more than once.
 *
 * ADR-0015: this is the ONLY place in the codebase that rewrites day-count fields after
 * creation, and only for rows where the initial snapshot was never written (workingDays = 0).
 * Normal code paths must never recompute day-counts for existing requests.
 */
export async function backfillLeaveDayCounts(): Promise<number> {
  const rows = await db.leaveRequest.findMany({
    where: { workingDays: 0, status: { in: ["PENDING", "APPROVED"] } },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      durationMode: true,
      leaveTypeId: true,
      employee: { select: { regionId: true } },
      leaveType: { select: { deductsAllowance: true } },
    },
  });

  if (rows.length === 0) return 0;

  let updated = 0;
  for (const row of rows) {
    const startISO = row.startDate.toISOString().slice(0, 10) as ISODate;
    const endISO = row.endDate.toISOString().slice(0, 10) as ISODate;
    const cal = await buildRegionCalendar(row.employee.regionId, startISO, endISO);
    const { workingDays, freeDays } = countDays(startISO, endISO, row.durationMode as "DAY" | "HALF" | "MULTI", cal);
    const allowanceDays = row.leaveType.deductsAllowance ? workingDays : 0;
    await db.leaveRequest.update({
      where: { id: row.id },
      data: { workingDays, freeDays, allowanceDays },
    });
    updated++;
  }

  return updated;
}
