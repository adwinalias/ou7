import "server-only";
// Coverage check data assembly (ADR-0014, story 28.1).
// Loads dept minStaffing + headcount + absentByDay in two queries (no N+1) then returns
// the CoverageInput that core/leave.assessCoverage / core/approvals.decideLeave expect.
import { isWorkingDay } from "@/core/calendar";
import type { CoverageInput } from "@/core/leave";
import { eachDate, rangesOverlap, toISO } from "@/core/dates";
import type { DurationMode, ISODate, RegionCalendar } from "@/core/types";
import { db } from "./db";

/**
 * Build the CoverageInput for a leave request, or return null when the employee
 * has no department or the department has no minStaffing threshold set.
 *
 * Two queries total:
 *  1. Employee → department.minStaffing + ACTIVE headcount (via _count).
 *  2. OTHER dept members' PENDING/APPROVED leave overlapping the range.
 *
 * @param excludeRequestId  Skip this requestId when counting overlapping leave (used at
 *                          approval so the request being decided isn't counted twice).
 */
export async function buildCoverageInput(
  requesterEmployeeId: string,
  startISO: ISODate,
  endISO: ISODate,
  mode: DurationMode,
  cal: RegionCalendar,
  opts: { excludeRequestId?: string } = {},
): Promise<CoverageInput | null> {
  const emp = await db.employee.findUnique({
    where: { id: requesterEmployeeId },
    select: {
      departmentId: true,
      department: {
        select: {
          minStaffing: true,
          _count: { select: { employees: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  if (!emp?.departmentId || !emp.department || emp.department.minStaffing == null) {
    return null;
  }

  const minStaffing = emp.department.minStaffing;
  const headcount = emp.department._count.employees;

  // One query: OTHER active dept members' overlapping PENDING/APPROVED leave.
  // TODO(28.3): filter by affectsStaffingLevels=true here once that field exists.
  const overlapping = await db.leaveRequest.findMany({
    where: {
      employee: { departmentId: emp.departmentId, status: "ACTIVE" },
      employeeId: { not: requesterEmployeeId },
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: new Date(`${endISO}T00:00:00.000Z`) },
      endDate: { gte: new Date(`${startISO}T00:00:00.000Z`) },
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

  return { minStaffing, headcount, startISO, endISO, mode, cal, absentByDay };
}
