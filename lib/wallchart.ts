import "server-only"; // Epic 22.4: DB-backed read; the privacy abstraction must run server-side only.
// Wall-chart data assembly (Epic 6.1 + 6.2). Fetches active employees + their
// APPROVED/PENDING leave overlapping a month, builds region-aware calendars, and delegates
// per-day cell construction + grouping/sorting to the pure core/wallchart. Privacy (6.5):
// notes are NEVER selected, so they can't reach the client.
import {
  buildRow,
  cellCsv,
  groupRows,
  monthDays,
  sortRows,
  type GroupBy,
  type RowGroup,
  type SortBy,
  type WallCell,
} from "@/core/wallchart";
import { toCsv } from "@/core/csv";
import {
  LEAVE_CATEGORIES,
  categoryShortCode,
  leaveCategory,
  type LeaveCategory,
} from "@/core/leave-categories";
import { isHR, allowedLeaveTypeVisibilities } from "@/core/authz";
import type { Actor, ISODate, RegionCalendar } from "@/core/types";
import { db } from "./db";

// The canonical representative leave-type code whose DB colour paints each category's
// cells/legend swatch for non-HR viewers. Reading the colour from the leaveType rows keeps
// it data-driven (no hard-coded hex) AND a real hex that core/letterColorToken can read.
const CATEGORY_CANONICAL_CODE: Record<LeaveCategory, string> = {
  Out: "V",
  "Sick (non-working)": "SN",
  "Sick (WFH)": "SW",
  "National Holiday": "H",
};

export interface WallRow {
  employeeId: string;
  name: string;
  regionName: string;
  departmentName: string | null;
  tags: string[];
  cells: WallCell[];
}

export interface WallHeaderDay {
  iso: ISODate;
  day: number;
  weekday: number; // 0=Sun … 6=Sat
}

export interface WallChartOptions {
  groupBy?: GroupBy;
  type?: string; // leave-type code filter
  name?: string; // employee name substring
  sort?: SortBy;
}

export interface WallChartData {
  year: number;
  month: number; // 1-based
  monthLabel: string;
  days: WallHeaderDay[];
  groups: RowGroup<WallRow>[];
  rows: WallRow[]; // flat (sorted) — convenience for callers/tests
  legend: { code: string; name: string; color: string }[];
  types: { code: string; name: string }[]; // for the filter dropdown
  options: Required<WallChartOptions>;
  prev: { y: number; m: number };
  next: { y: number; m: number };
  todayISO: ISODate;
}

/**
 * CSV of the chart reflecting whatever filters/sort produced `data` (Epic 6.4): one row
 * per employee, a column per day of the month. Notes are never present (6.5).
 */
export function buildWallChartCsv(data: WallChartData): string {
  const header = ["Employee", "Department", "Region", ...data.days.map((d) => String(d.day))];
  const body = data.rows.map((row) => [
    row.name,
    row.departmentName ?? "",
    row.regionName,
    ...row.cells.map(cellCsv),
  ]);
  return toCsv([header, ...body]);
}

/** Today in Asia/Dubai (all scheduling/date logic is Dubai time). */
function dubaiToday(): ISODate {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

function shiftMonth(year: number, month: number, delta: number): { y: number; m: number } {
  const zero = year * 12 + (month - 1) + delta;
  return { y: Math.floor(zero / 12), m: (zero % 12) + 1 };
}

export async function getWallChart(
  year: number,
  month: number,
  actor: Actor,
  opts: WallChartOptions = {},
): Promise<WallChartData> {
  // RBAC + privacy (Epic 19.7, decision #5; ties to 22.4 taint). For NON-HR viewers the
  // specific personal leave type (code, name AND colour) must NEVER reach the client — we
  // abstract every cell/legend entry to one of four public categories, SERVER-SIDE. HR
  // receives the real type. The "leave type" filter is removed for non-HR (types: []).
  const hr = isHR(actor);
  const options: Required<WallChartOptions> = {
    groupBy: opts.groupBy ?? "none",
    // A non-HR viewer has no real-type filter (the control is removed), and honouring a
    // raw `type` code from the query would both narrow on AND confirm a specific type.
    type: hr ? (opts.type ?? "") : "",
    name: opts.name ?? "",
    sort: opts.sort ?? "name",
  };

  const dayList = monthDays(year, month);
  const firstISO = dayList[0]!;
  const lastISO = dayList[dayList.length - 1]!;
  const monthStart = new Date(`${firstISO}T00:00:00.000Z`);
  const monthEnd = new Date(`${lastISO}T00:00:00.000Z`);

  const employees = await db.employee.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      region: { select: { id: true, name: true, weekendDays: true } },
      department: { select: { name: true } },
      tags: { select: { name: true } },
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

  // Leave overlapping the month. visibleOnWallChart only. NOTES ARE NOT SELECTED.
  // Story 27.1: visibility filter — show a row iff the leave type is visible to the actor
  // (per allowedLeaveTypeVisibilities) OR the row belongs to the actor themselves.
  const allowedVis = allowedLeaveTypeVisibilities(actor);
  const leave = await db.leaveRequest.findMany({
    where: {
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
      OR: [
        { leaveType: { visibleOnWallChart: true, visibility: { in: allowedVis }, ...(options.type ? { code: options.type } : {}) } },
        { employeeId: actor.employeeId, leaveType: { visibleOnWallChart: true, ...(options.type ? { code: options.type } : {}) } },
      ],
    },
    select: {
      employeeId: true,
      startDate: true,
      endDate: true,
      durationMode: true,
      halfDayPeriod: true,
      status: true,
      leaveType: { select: { code: true, color: true, name: true } },
    },
  });

  // For non-HR: the real hex that paints each category, read from the canonical leave-type
  // rows (V/SN/SW/H). A real hex → core/letterColorToken still works; data-driven → no
  // hard-coded hex. Falls back to the vacation hue for any category whose canonical type
  // isn't seeded, so a cell never carries an empty/undefined colour.
  const categoryColor = new Map<LeaveCategory, string>();
  if (!hr) {
    const canonicalCodes = Object.values(CATEGORY_CANONICAL_CODE);
    const canonicalTypes = await db.leaveType.findMany({
      where: { code: { in: canonicalCodes } },
      select: { code: true, color: true },
    });
    const colorByCode = new Map(canonicalTypes.map((t) => [t.code.toUpperCase(), t.color]));
    const outFallback = colorByCode.get(CATEGORY_CANONICAL_CODE.Out) ?? "#2F6FEB";
    for (const c of LEAVE_CATEGORIES) {
      categoryColor.set(c, colorByCode.get(CATEGORY_CANONICAL_CODE[c].toUpperCase()) ?? outFallback);
    }
  }

  // Abstract a leave row's identity for non-HR viewers (code → category short code,
  // colour → that category's canonical colour); HR keeps the real type untouched.
  const abstractCode = (code: string): string => (hr ? code : categoryShortCode(leaveCategory(code)));
  const abstractColor = (code: string, color: string): string =>
    hr ? color : (categoryColor.get(leaveCategory(code)) ?? color);

  const byEmployee = new Map<string, typeof leave>();
  const legendMap = new Map<string, { code: string; name: string; color: string }>();
  for (const l of leave) {
    (byEmployee.get(l.employeeId) ?? byEmployee.set(l.employeeId, []).get(l.employeeId)!).push(l);
    if (hr) {
      legendMap.set(l.leaveType.code, { code: l.leaveType.code, name: l.leaveType.name, color: l.leaveType.color });
    }
  }

  // Non-HR legend = the four public categories (no real type names/codes/colours).
  const legend = hr
    ? [...legendMap.values()].sort((a, b) => a.code.localeCompare(b.code))
    : LEAVE_CATEGORIES.map((c) => ({
        code: categoryShortCode(c),
        name: c,
        color: categoryColor.get(c)!,
      }));

  const todayISO = dubaiToday();
  const nameFilter = options.name.trim().toLowerCase();

  let rows: WallRow[] = employees
    .filter((e) => !nameFilter || `${e.firstName} ${e.lastName}`.toLowerCase().includes(nameFilter))
    .map((e) => {
      const segments = (byEmployee.get(e.id) ?? []).map((l) => ({
        startISO: l.startDate.toISOString().slice(0, 10),
        endISO: l.endDate.toISOString().slice(0, 10),
        status: l.status as "APPROVED" | "PENDING",
        // Abstracted for non-HR (so cells carry only the category code+colour); the raw
        // type never reaches buildRow → never reaches the client payload.
        code: abstractCode(l.leaveType.code),
        color: abstractColor(l.leaveType.code, l.leaveType.color),
        mode: l.durationMode,
        half: l.halfDayPeriod,
      }));
      return {
        employeeId: e.id,
        name: `${e.firstName} ${e.lastName}`.trim(),
        regionName: e.region.name,
        departmentName: e.department?.name ?? null,
        tags: e.tags.map((t) => t.name),
        cells: buildRow(dayList, segments, calendars.get(e.region.id)!, todayISO),
      };
    });

  rows = sortRows(rows, options.sort);
  const groups = groupRows(rows, options.groupBy);

  const days: WallHeaderDay[] = dayList.map((iso) => {
    const d = new Date(`${iso}T00:00:00.000Z`);
    return { iso, day: d.getUTCDate(), weekday: d.getUTCDay() };
  });

  // The leave-type filter source. HR only — for non-HR the filter is removed (W6) and an
  // empty list also means no real type names/codes can reach the non-HR payload here.
  const types = hr
    ? (
        await db.leaveType.findMany({
          where: { active: true, visibleOnWallChart: true },
          select: { code: true, name: true },
          orderBy: { name: "asc" },
        })
      ).map((t) => ({ code: t.code, name: t.name }))
    : [];

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    year,
    month,
    monthLabel,
    days,
    groups,
    rows,
    legend,
    types,
    options,
    prev: shiftMonth(year, month, -1),
    next: shiftMonth(year, month, 1),
    todayISO,
  };
}
