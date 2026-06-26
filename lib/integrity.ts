import "server-only";
// ADR-0015 story 30.3 — read-only integrity check for day-count drift.
// Compares the stored day-count snapshot on every PENDING/APPROVED LeaveRequest
// against a fresh recompute using the region effective on the booking's start date.
// NO writes occur in this module. The stored snapshot is authoritative; this
// surfaces drift for HR awareness (e.g. after a WhosOff import or backfill error).
//
// ponytail: per-request region/calendar resolve (not batched) — this is an
// on-demand HR diagnostic over a bounded set, not a hot path.
import { countDays } from "@/core/calendar";
import { regionOnDate } from "@/core/region";
import type { ISODate, RegionCalendar } from "@/core/types";
import { db } from "./db";

export interface DayCountDiscrepancy {
  requestId: string;
  employeeName: string;
  startISO: ISODate;
  endISO: ISODate;
  stored: { workingDays: number; freeDays: number; allowanceDays: number };
  recomputed: { workingDays: number; freeDays: number; allowanceDays: number };
  effectiveRegionName: string;
  explanation: string;
}

/** Build a RegionCalendar for the years spanned by startISO…endISO. */
async function buildCalendarForRegion(
  regionId: string,
  startISO: ISODate,
  endISO: ISODate,
): Promise<RegionCalendar> {
  const startYear = Number(startISO.slice(0, 4));
  const endYear = Number(endISO.slice(0, 4));
  const [region, holidayRows] = await Promise.all([
    db.region.findUniqueOrThrow({ where: { id: regionId }, select: { weekendDays: true } }),
    db.holiday.findMany({
      where: { regionId, year: { gte: startYear, lte: endYear } },
      select: { date: true },
    }),
  ]);
  return {
    weekendDays: region.weekendDays,
    holidays: new Set<ISODate>(holidayRows.map((h) => h.date.toISOString().slice(0, 10) as ISODate)),
  };
}

/**
 * Returns every PENDING/APPROVED LeaveRequest whose stored day-count snapshot
 * differs from a fresh recompute against the region effective on its start date
 * (via EmployeeRegionAssignment history).
 *
 * READ-ONLY — no writes, no mutations.
 */
export async function findDayCountDiscrepancies(): Promise<DayCountDiscrepancy[]> {
  // Load all PENDING/APPROVED requests plus the data needed for recompute.
  const requests = await db.leaveRequest.findMany({
    where: { status: { in: ["PENDING", "APPROVED"] } },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      durationMode: true,
      workingDays: true,
      freeDays: true,
      allowanceDays: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          regionId: true,
          regionAssignments: {
            select: { regionId: true, effectiveFrom: true, createdAt: true },
            orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
          },
        },
      },
      leaveType: { select: { deductsAllowance: true } },
    },
  });

  if (requests.length === 0) return [];

  // Pre-load all needed region names in one query to avoid N+1.
  const allRegionIds = new Set<string>();
  for (const req of requests) {
    allRegionIds.add(req.employee.regionId);
    for (const a of req.employee.regionAssignments) allRegionIds.add(a.regionId);
  }
  const regionNames = new Map<string, string>(
    (await db.region.findMany({
      where: { id: { in: [...allRegionIds] } },
      select: { id: true, name: true },
    })).map((r) => [r.id, r.name]),
  );

  const discrepancies: DayCountDiscrepancy[] = [];

  for (const req of requests) {
    const startISO = req.startDate.toISOString().slice(0, 10) as ISODate;
    const endISO = req.endDate.toISOString().slice(0, 10) as ISODate;

    // Resolve effective region on start date using the assignment history.
    const assignments = req.employee.regionAssignments.map((a) => ({
      regionId: a.regionId,
      effectiveFromISO: a.effectiveFrom.toISOString().slice(0, 10) as ISODate,
    }));
    const effectiveRegionId =
      regionOnDate(assignments, startISO) ?? req.employee.regionId;

    const cal = await buildCalendarForRegion(effectiveRegionId, startISO, endISO);
    const { workingDays: wd, freeDays: fd } = countDays(
      startISO,
      endISO,
      req.durationMode as "DAY" | "HALF" | "MULTI",
      cal,
    );
    const alw = req.leaveType.deductsAllowance ? wd : 0;

    const stored = {
      workingDays: req.workingDays,
      freeDays: req.freeDays,
      allowanceDays: req.allowanceDays,
    };
    const recomputed = { workingDays: wd, freeDays: fd, allowanceDays: alw };

    if (
      stored.workingDays !== recomputed.workingDays ||
      stored.freeDays !== recomputed.freeDays ||
      stored.allowanceDays !== recomputed.allowanceDays
    ) {
      const regionName = regionNames.get(effectiveRegionId) ?? effectiveRegionId;
      discrepancies.push({
        requestId: req.id,
        employeeName: `${req.employee.firstName} ${req.employee.lastName}`,
        startISO,
        endISO,
        stored,
        recomputed,
        effectiveRegionName: regionName,
        explanation: `Stored ${stored.workingDays} working day(s); recompute against ${regionName} (region effective on ${startISO}) gives ${recomputed.workingDays}.`,
      });
    }
  }

  return discrepancies;
}
