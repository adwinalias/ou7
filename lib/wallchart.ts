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
import type { ISODate, RegionCalendar } from "@/core/types";
import { db } from "./db";

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

export async function getWallChart(year: number, month: number, opts: WallChartOptions = {}): Promise<WallChartData> {
  const options: Required<WallChartOptions> = {
    groupBy: opts.groupBy ?? "none",
    type: opts.type ?? "",
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
  const leave = await db.leaveRequest.findMany({
    where: {
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
      leaveType: { visibleOnWallChart: true, ...(options.type ? { code: options.type } : {}) },
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

  const byEmployee = new Map<string, typeof leave>();
  const legendMap = new Map<string, { code: string; name: string; color: string }>();
  for (const l of leave) {
    (byEmployee.get(l.employeeId) ?? byEmployee.set(l.employeeId, []).get(l.employeeId)!).push(l);
    legendMap.set(l.leaveType.code, { code: l.leaveType.code, name: l.leaveType.name, color: l.leaveType.color });
  }

  const todayISO = dubaiToday();
  const nameFilter = options.name.trim().toLowerCase();

  let rows: WallRow[] = employees
    .filter((e) => !nameFilter || `${e.firstName} ${e.lastName}`.toLowerCase().includes(nameFilter))
    .map((e) => {
      const segments = (byEmployee.get(e.id) ?? []).map((l) => ({
        startISO: l.startDate.toISOString().slice(0, 10),
        endISO: l.endDate.toISOString().slice(0, 10),
        status: l.status as "APPROVED" | "PENDING",
        code: l.leaveType.code,
        color: l.leaveType.color,
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

  const types = (
    await db.leaveType.findMany({
      where: { active: true, visibleOnWallChart: true },
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    })
  ).map((t) => ({ code: t.code, name: t.name }));

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
    legend: [...legendMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
    types,
    options,
    prev: shiftMonth(year, month, -1),
    next: shiftMonth(year, month, 1),
    todayISO,
  };
}
