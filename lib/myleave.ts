import "server-only"; // Epic 22.4: DB-backed personal leave history — server-only.
// My-Leave history reads (Epic 7.1). The employee is always resolved from the session by
// the caller (requireUser) and passed here — never a client-supplied id. Returns the
// employee's OWN leave only. Since it's their own data, notes/details are included.
import { durationLabel, sumColumns, type NumericColumns } from "@/core/history";
import type { LeaveStatus } from "@/core/types";
import { db } from "./db";

const PAGE_SIZE = 20;
const STATUSES: LeaveStatus[] = ["PENDING", "APPROVED", "DECLINED", "CANCELLED"];

export interface HistoryFilters {
  from?: string; // ISO date
  to?: string; // ISO date
  decision?: string; // LeaveStatus
  type?: string; // leave-type code
  page?: number;
}

export interface HistoryRow {
  id: string;
  fromISO: string;
  toISO: string;
  duration: string;
  freeDays: number;
  workingDays: number;
  allowanceDays: number;
  typeName: string;
  typeCode: string;
  typeColor: string;
  status: LeaveStatus;
  notes: string | null;
}

export interface HistoryResult {
  rows: HistoryRow[];
  totals: NumericColumns;
  page: number;
  pageCount: number;
  total: number;
  filters: { from: string; to: string; decision: string; type: string };
  types: { code: string; name: string }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const atUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const isDate = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function getLeaveHistory(employeeId: string, filters: HistoryFilters): Promise<HistoryResult> {
  const from = isDate(filters.from) ? filters.from : "";
  const to = isDate(filters.to) ? filters.to : "";
  const decision = STATUSES.includes(filters.decision as LeaveStatus) ? (filters.decision as LeaveStatus) : "";
  const type = filters.type ?? "";

  // Overlap with the date range (inclusive); each bound is optional.
  const dateWhere = {
    ...(to ? { startDate: { lte: atUtc(to) } } : {}),
    ...(from ? { endDate: { gte: atUtc(from) } } : {}),
  };

  const where = {
    employeeId, // server-resolved — own data only
    ...dateWhere,
    ...(decision ? { status: decision } : {}),
    ...(type ? { leaveType: { code: type } } : {}),
  };

  const records = await db.leaveRequest.findMany({
    where,
    select: {
      id: true,
      startDate: true,
      endDate: true,
      durationMode: true,
      freeDays: true,
      workingDays: true,
      allowanceDays: true,
      status: true,
      notes: true,
      leaveType: { select: { name: true, code: true, color: true } },
    },
    orderBy: { startDate: "desc" },
  });

  const rows: HistoryRow[] = records.map((r) => ({
    id: r.id,
    fromISO: iso(r.startDate),
    toISO: iso(r.endDate),
    duration: durationLabel(r.durationMode, iso(r.startDate), iso(r.endDate)),
    freeDays: r.freeDays,
    workingDays: r.workingDays,
    allowanceDays: r.allowanceDays,
    typeName: r.leaveType.name,
    typeCode: r.leaveType.code,
    typeColor: r.leaveType.color,
    status: r.status,
    notes: r.notes,
  }));

  const totals = sumColumns(rows); // totals across the whole filtered set, not just the page
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1)), pageCount);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const types = (
    await db.leaveType.findMany({ where: { active: true }, select: { code: true, name: true }, orderBy: { name: "asc" } })
  ).map((t) => ({ code: t.code, name: t.name }));

  return { rows: pageRows, totals, page, pageCount, total, filters: { from, to, decision, type }, types };
}

export interface YearLeaveRecord {
  id: string;
  fromISO: string;
  toISO: string;
  duration: string;
  allowanceDays: number;
  typeName: string;
  typeCode: string;
  typeColor: string;
  status: LeaveStatus;
}

/**
 * Per-year drill-in for the HR Admin allowance surface (Epic 24.2 / ADR-0013). Returns one
 * employee's leave requests overlapping the given calendar year (the records "behind" that
 * year's balance), newest first. `employeeId` is HR-supplied here (the caller has already
 * re-checked HR server-side); this is the same employee's data HR already manages. Read-only.
 */
export async function getEmployeeLeaveRecordsForYear(employeeId: string, year: number): Promise<YearLeaveRecord[]> {
  const records = await db.leaveRequest.findMany({
    where: {
      employeeId,
      startDate: { lte: atUtc(`${year}-12-31`) },
      endDate: { gte: atUtc(`${year}-01-01`) },
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      durationMode: true,
      allowanceDays: true,
      status: true,
      leaveType: { select: { name: true, code: true, color: true } },
    },
    orderBy: { startDate: "desc" },
  });

  return records.map((r) => ({
    id: r.id,
    fromISO: iso(r.startDate),
    toISO: iso(r.endDate),
    duration: durationLabel(r.durationMode, iso(r.startDate), iso(r.endDate)),
    allowanceDays: r.allowanceDays,
    typeName: r.leaveType.name,
    typeCode: r.leaveType.code,
    typeColor: r.leaveType.color,
    status: r.status,
  }));
}
