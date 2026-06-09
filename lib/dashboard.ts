// Dashboard reads (Epic 8). Read-only composition of existing engine reads:
// getOpenPeriodBalance for the allowance donut, and core/wallchart.buildRow (reused, not
// duplicated) for the next-7-days strip. Notes are never selected (privacy preserved).
import { addDays, parseISO, toISO } from "@/core/dates";
import { buildRow, type WallCell } from "@/core/wallchart";
import type { ISODate, RegionCalendar } from "@/core/types";
import { getOpenPeriodBalance, type PeriodBalance } from "./allowance";
import { db } from "./db";

export interface DashboardData {
  balance: PeriodBalance | null;
  regionName: string;
  days: WallCell[]; // next 7 days from today (Dubai), reusing the wall-chart cell vocabulary
}

// WorkPattern booleans → weekday index (0=Sun … 6=Sat).
const PATTERN_WEEKDAY: { key: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"; index: number }[] = [
  { key: "sun", index: 0 },
  { key: "mon", index: 1 },
  { key: "tue", index: 2 },
  { key: "wed", index: 3 },
  { key: "thu", index: 4 },
  { key: "fri", index: 5 },
  { key: "sat", index: 6 },
];

function dubaiToday(): ISODate {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

export async function getDashboard(employeeId: string): Promise<DashboardData> {
  const employee = await db.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: {
      region: { select: { name: true, weekendDays: true } },
      workPattern: { select: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true } },
    },
  });

  const todayISO = dubaiToday();
  const start = parseISO(todayISO);
  const dayList: ISODate[] = Array.from({ length: 7 }, (_, i) => toISO(addDays(start, i)));
  const endISO = dayList[dayList.length - 1]!;

  // Effective non-working days = region weekends ∪ the employee's work-pattern days off.
  const wp = employee.workPattern;
  const patternOff = wp ? PATTERN_WEEKDAY.filter((d) => !wp[d.key]).map((d) => d.index) : [];
  const effectiveCal: RegionCalendar = {
    weekendDays: [...new Set([...employee.region.weekendDays, ...patternOff])],
    holidays: new Set<ISODate>(), // region holidays land here once Epic 10 populates them
  };

  // The employee's own leave overlapping the window. NOTES ARE NOT SELECTED.
  const leave = await db.leaveRequest.findMany({
    where: {
      employeeId,
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: parseISO(endISO) },
      endDate: { gte: start },
    },
    select: {
      startDate: true,
      endDate: true,
      durationMode: true,
      halfDayPeriod: true,
      status: true,
      leaveType: { select: { code: true, color: true } },
    },
  });

  const segments = leave.map((l) => ({
    startISO: l.startDate.toISOString().slice(0, 10),
    endISO: l.endDate.toISOString().slice(0, 10),
    status: l.status as "APPROVED" | "PENDING",
    code: l.leaveType.code,
    color: l.leaveType.color,
    mode: l.durationMode,
    half: l.halfDayPeriod,
  }));

  return {
    balance: await getOpenPeriodBalance(employeeId),
    regionName: employee.region.name,
    days: buildRow(dayList, segments, effectiveCal, todayISO),
  };
}
