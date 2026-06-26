import "server-only";
// Coverage check data assembly (ADR-0014, stories 28.1 + 28.2).
// Loads dept minStaffing + maxLeavePerDay + headcount + absentByDay in two queries (no N+1)
// then returns the CoverageInput that core/leave.assessCoverage / core/approvals.decideLeave expect.
import { isWorkingDay } from "@/core/calendar";
import type { CoverageInput } from "@/core/leave";
import { eachDate, rangesOverlap, toISO } from "@/core/dates";
import type { DurationMode, ISODate, RegionCalendar } from "@/core/types";
import { db } from "./db";

/**
 * Build the CoverageInput for a leave request, or return null when:
 *  - the employee has no department, OR
 *  - BOTH minStaffing and maxLeavePerDay are null (no check needed), OR
 *  - the requested leave type has affectsStaffingLevels=false (skip entirely).
 *
 * Two queries total:
 *  1. Employee → department.minStaffing + department.maxLeavePerDay + ACTIVE headcount (via _count).
 *  2. OTHER dept members' PENDING/APPROVED, affectsStaffingLevels=true leave overlapping the range.
 *
 * @param leaveTypeAffectsStaffing  Pass the requested type's affectsStaffingLevels value.
 *                                   false → return null immediately (no coverage check for this booking).
 * @param excludeRequestId  Skip this requestId when counting overlapping leave (used at
 *                          approval so the request being decided isn't counted twice).
 */
export async function buildCoverageInput(
  requesterEmployeeId: string,
  startISO: ISODate,
  endISO: ISODate,
  mode: DurationMode,
  cal: RegionCalendar,
  opts: { excludeRequestId?: string; leaveTypeAffectsStaffing?: boolean } = {},
): Promise<CoverageInput | null> {
  // Story 28.3: if the requested type doesn't affect staffing, skip the whole check.
  if (opts.leaveTypeAffectsStaffing === false) return null;
  const emp = await db.employee.findUnique({
    where: { id: requesterEmployeeId },
    select: {
      departmentId: true,
      department: {
        select: {
          minStaffing: true,
          maxLeavePerDay: true,
          _count: { select: { employees: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  // Skip when: no department, OR both thresholds are null (nothing to check).
  if (
    !emp?.departmentId ||
    !emp.department ||
    (emp.department.minStaffing == null && emp.department.maxLeavePerDay == null)
  ) {
    return null;
  }

  const minStaffing = emp.department.minStaffing;
  const maxLeavePerDay = emp.department.maxLeavePerDay;
  const headcount = emp.department._count.employees;

  // One query: OTHER active dept members' overlapping PENDING/APPROVED leave.
  // Story 28.3: only count leave whose type affectsStaffingLevels=true.
  const overlapping = await db.leaveRequest.findMany({
    where: {
      employee: { departmentId: emp.departmentId, status: "ACTIVE" },
      employeeId: { not: requesterEmployeeId },
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: new Date(`${endISO}T00:00:00.000Z`) },
      endDate: { gte: new Date(`${startISO}T00:00:00.000Z`) },
      leaveType: { affectsStaffingLevels: true },
      // Exclude the request being re-checked at approval to avoid double-counting.
      ...(opts.excludeRequestId ? { id: { not: opts.excludeRequestId } } : {}),
    },
    select: { employeeId: true, startDate: true, endDate: true },
  });

  // Build absentByDay: count DISTINCT absent members per working day in range.
  // Using a Set per day so a member with two bookings on the same day counts once.
  const rangeEnd = mode === "DAY" ? startISO : endISO;
  const absentSets: Record<ISODate, Set<string>> = {};

  for (const req of overlapping) {
    const rStart = toISO(req.startDate);
    const rEnd = toISO(req.endDate);
    for (const d of eachDate(startISO, rangeEnd)) {
      if (!isWorkingDay(d, cal)) continue;
      const iso = toISO(d);
      if (!rangesOverlap(iso, iso, rStart, rEnd)) continue;
      (absentSets[iso] ??= new Set()).add(req.employeeId);
    }
  }

  const absentByDay: Record<ISODate, number> = {};
  for (const [day, set] of Object.entries(absentSets)) {
    absentByDay[day] = set.size;
  }

  return { minStaffing, maxLeavePerDay, headcount, startISO, endISO, mode, cal, absentByDay };
}
