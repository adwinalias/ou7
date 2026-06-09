// Wall-chart data assembly (Epic 6.1). Fetches active employees + their APPROVED/PENDING
// leave overlapping a month, builds region-aware calendars, and delegates the per-day cell
// construction to the pure core/wallchart. Privacy (6.5): notes are NEVER selected, so they
// can't reach the client.
import { buildRow, monthDays, type WallCell } from "@/core/wallchart";
import type { ISODate, RegionCalendar } from "@/core/types";
import { db } from "./db";

export interface WallRow {
  employeeId: string;
  name: string;
  regionName: string;
  cells: WallCell[];
}

export interface WallHeaderDay {
  iso: ISODate;
  day: number;
  weekday: number; // 0=Sun … 6=Sat
}

export interface WallChartData {
  year: number;
  month: number; // 1-based
  monthLabel: string;
  days: WallHeaderDay[];
  rows: WallRow[];
  legend: { code: string; name: string; color: string }[];
  prev: { y: number; m: number };
  next: { y: number; m: number };
  todayISO: ISODate;
}

/** Today in Asia/Dubai (all scheduling/date logic is Dubai time). */
function dubaiToday(): ISODate {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

function shiftMonth(year: number, month: number, delta: number): { y: number; m: number } {
  const zero = (year * 12 + (month - 1)) + delta;
  return { y: Math.floor(zero / 12), m: (zero % 12) + 1 };
}

export async function getWallChart(year: number, month: number): Promise<WallChartData> {
  const dayList = monthDays(year, month);
  const firstISO = dayList[0]!;
  const lastISO = dayList[dayList.length - 1]!;
  const monthStart = new Date(`${firstISO}T00:00:00.000Z`);
  const monthEnd = new Date(`${lastISO}T00:00:00.000Z`);

  const employees = await db.employee.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true, region: { select: { id: true, name: true, weekendDays: true } } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  // Region calendars (weekends + this year's holidays) — built once per distinct region.
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
      leaveType: { visibleOnWallChart: true },
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
  const rows: WallRow[] = employees.map((e) => {
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
      cells: buildRow(dayList, segments, calendars.get(e.region.id)!, todayISO),
    };
  });

  const days: WallHeaderDay[] = dayList.map((iso) => {
    const d = new Date(`${iso}T00:00:00.000Z`);
    return { iso, day: d.getUTCDate(), weekday: d.getUTCDay() };
  });

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
    rows,
    legend: [...legendMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
    prev: shiftMonth(year, month, -1),
    next: shiftMonth(year, month, 1),
    todayISO,
  };
}
