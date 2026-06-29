// "Who's off" dashboard widget data (Epic 18.2; V2 decisions #3, #5). Read-only.
// One bounded query (the getWallChart join shape — employees + leave + region + leaveType,
// NO per-employee query / N+1), region-aware via the same region-calendar build, then the
// pure core/wallchart.buildRow decides which days are genuinely "off" (so we never list
// someone whose only overlap is their own weekend/holiday).
//
// SCOPE (orchestrator decision): COMPANY-WIDE only (decision #3 default). The configurable
// per-department restriction (decision #3 / Epic 19.7) is a planned FOLLOW-UP — it needs a
// new config table + a schema migration + admin UI and is deliberately NOT built here.
//
// PRIVACY (decision #5, ties to 22.4 taint): the four-category abstraction is enforced
// SERVER-SIDE. Non-HR payload entries carry ONLY a `category` and never the raw leave-type
// code/name/colour. HR gets the real type. The per-viewer payload TYPES reflect this — a
// non-HR entry has no `typeName`/`typeCode`/`color` field to leak.
import { buildRow } from "@/core/wallchart";
import { leaveCategory, type LeaveCategory } from "@/core/leave-categories";
import { addDays, parseISO, toISO } from "@/core/dates";
import type { ISODate, RegionCalendar } from "@/core/types";
import { isHR, allowedLeaveTypeVisibilities } from "@/core/authz";
import type { Actor } from "@/core/types";
import { dubaiTodayISO } from "./dates";
import { db } from "./db";

type WhosOffStatus = "APPROVED" | "PENDING";

/** What every viewer sees: who, where, the public category, status and the off window. */
interface WhosOffEntryBase {
  employeeId: string;
  name: string;
  regionName: string;
  category: LeaveCategory;
  status: WhosOffStatus;
  startISO: ISODate; // first genuinely-off day within the [today, today+days] window
  endISO: ISODate; // last genuinely-off day within the window
  offToday: boolean;
}

/** Non-HR entry — NO raw leave type. Exactly the four-category abstraction. */
export type WhosOffEntryPublic = WhosOffEntryBase;

/** HR entry — augmented with the real leave type. */
export interface WhosOffEntryHR extends WhosOffEntryBase {
  typeCode: string;
  typeName: string;
  color: string;
}

export interface WhosOffData {
  hr: boolean;
  days: number; // window length (1 = today, 7 = today + next 7)
  todayISO: ISODate;
  endISO: ISODate;
  entries: WhosOffEntryPublic[] | WhosOffEntryHR[];
}

/**
 * Company-wide absentees for [today, today+days] (Dubai), region-aware. Approved + pending
 * leave on visible-on-calendar types. Non-HR viewers receive only the four categories.
 */
export async function getWhosOff(actor: Actor, days = 7): Promise<WhosOffData> {
  const hr = isHR(actor);
  const todayISO = dubaiTodayISO();
  const start = parseISO(todayISO);
  // Window is "today + next N days" inclusive of today → N+1 calendar days.
  const dayList: ISODate[] = Array.from({ length: days + 1 }, (_, i) => toISO(addDays(start, i)));
  const firstISO = dayList[0]!;
  const lastISO = dayList[dayList.length - 1]!;
  const windowStart = parseISO(firstISO);
  const windowEnd = parseISO(lastISO);
  const year = Number(todayISO.slice(0, 4));

  // Active employees + region (weekend rules) — the getWallChart select shape.
  const employees = await db.employee.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      region: { select: { id: true, name: true, weekendDays: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  // Region calendars (weekends + this year's holidays), built once per distinct region.
  const regionIds = [...new Set(employees.map((e) => e.region.id))];
  const holidayRows = await db.holiday.findMany({
    where: { regionId: { in: regionIds }, year },
    select: { regionId: true, date: true },
  });
  const calendars = new Map<string, RegionCalendar>();
  for (const e of employees) {
    if (calendars.has(e.region.id)) continue;
    const holidays = new Set<ISODate>(
      holidayRows.filter((h) => h.regionId === e.region.id).map((h) => h.date.toISOString().slice(0, 10)),
    );
    calendars.set(e.region.id, { weekendDays: e.region.weekendDays, holidays });
  }

  // Leave overlapping the window. visibleOnWallChart only. NOTES ARE NOT SELECTED.
  // One bounded query across the company — no per-employee query (N+1).
  // Story 27.1: visibility filter — own rows always visible; others filtered by visibility.
  const allowedVis = allowedLeaveTypeVisibilities(actor);
  const leave = await db.leaveRequest.findMany({
    where: {
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: windowEnd },
      endDate: { gte: windowStart },
      employee: { status: "ACTIVE" },
      OR: [
        { leaveType: { visibleOnWallChart: true, visibility: { in: allowedVis } } },
        { employeeId: actor.employeeId, leaveType: { visibleOnWallChart: true } },
      ],
    },
    select: {
      employeeId: true,
      startDate: true,
      endDate: true,
      durationMode: true,
      halfDayPeriod: true,
      status: true,
      leaveType: { select: { code: true, name: true, color: true } },
    },
  });

  const empById = new Map(employees.map((e) => [e.id, e]));
  const byEmployee = new Map<string, typeof leave>();
  for (const l of leave) {
    const empLeave = byEmployee.get(l.employeeId) ?? [];
    empLeave.push(l);
    byEmployee.set(l.employeeId, empLeave);
  }

  const publicEntries: WhosOffEntryPublic[] = [];
  const hrEntries: WhosOffEntryHR[] = [];

  for (const [employeeId, leaves] of byEmployee) {
    const emp = empById.get(employeeId);
    if (!emp) continue;
    const cal = calendars.get(emp.region.id)!;
    const name = `${emp.firstName} ${emp.lastName}`.trim();

    // One row per leave request: the pure builder marks which days are GENUINELY off
    // (region-aware — a person's own weekend/holiday is "off", not leave).
    for (const l of leaves) {
      const cells = buildRow(
        dayList,
        [
          {
            startISO: l.startDate.toISOString().slice(0, 10),
            endISO: l.endDate.toISOString().slice(0, 10),
            status: l.status as WhosOffStatus,
            code: l.leaveType.code,
            color: l.leaveType.color,
            mode: l.durationMode,
            half: l.halfDayPeriod,
          },
        ],
        cal,
        todayISO,
      );
      const offCells = cells.filter((c) => c.kind === "approved" || c.kind === "pending");
      if (offCells.length === 0) continue; // overlap was only weekend/holiday → not "off"

      const base: WhosOffEntryBase = {
        employeeId,
        name,
        regionName: emp.region.name,
        category: leaveCategory(l.leaveType.code),
        status: l.status as WhosOffStatus,
        startISO: offCells[0]!.iso,
        endISO: offCells[offCells.length - 1]!.iso,
        offToday: offCells.some((c) => c.today),
      };

      if (hr) {
        hrEntries.push({
          ...base,
          typeCode: l.leaveType.code,
          typeName: l.leaveType.name,
          color: l.leaveType.color,
        });
      } else {
        publicEntries.push(base);
      }
    }
  }

  // Sort: off-today first, then earliest start, then name.
  const sort = <T extends WhosOffEntryBase>(arr: T[]): T[] =>
    [...arr].sort(
      (a, b) =>
        Number(b.offToday) - Number(a.offToday) ||
        a.startISO.localeCompare(b.startISO) ||
        a.name.localeCompare(b.name),
    );

  return {
    hr,
    days,
    todayISO,
    endISO: lastISO,
    entries: hr ? sort(hrEntries) : sort(publicEntries),
  };
}
