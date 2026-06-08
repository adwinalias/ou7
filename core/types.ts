import type { ISODate } from "./dates";

export type { ISODate };

export type DurationMode = "DAY" | "HALF" | "MULTI";
export type HalfDayPeriod = "AM" | "PM";
export type LeaveStatus = "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";

// ─── Authorization (mirror the Prisma enums; kept as plain unions so core/ stays
//     framework- and DB-agnostic). The RBAC policy lives in core/authz. ───────────
export type Role = "STAFF" | "APPROVER" | "HR";
export type ApproverLevel = "NONE" | "APPROVER" | "APPROVER_ADD" | "APPROVER_ADD_EDIT";
export type EmployeeStatus = "ACTIVE" | "INACTIVE";

/**
 * The authenticated subject, resolved fresh from the DB on each guarded action.
 * `approverForIds` are the employees this actor is an assigned approver for.
 */
export interface Actor {
  employeeId: string;
  role: Role;
  approverLevel: ApproverLevel;
  status: EmployeeStatus;
  approverForIds: string[];
}

/** A market's working calendar. weekendDays: 0=Sun … 6=Sat. */
export interface RegionCalendar {
  weekendDays: number[];
  holidays: Set<ISODate>;
}

export interface DayCount {
  workingDays: number; // counts toward allowance (half-day = 0.5)
  freeDays: number; // weekends/holidays inside the range
}

/** Inputs to the balance computation for one allowance period. */
export interface AllowanceInputs {
  opening: number;
  carryOver: number;
  adjustments: number;
  takenApproved: number;
  deductions: number;
}

/** Per-market carry-over rule. capDays null = no carry-over. */
export interface CarryOverRule {
  capDays: number | null;
}

export interface DateRange {
  startISO: ISODate;
  endISO: ISODate;
}
