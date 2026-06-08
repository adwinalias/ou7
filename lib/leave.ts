// Leave request orchestration (Epic 5.1–5.3). All I/O lives here; the actual rules are
// the already-tested pure functions in core/leave and core/allowance. The flow is:
//   app/request → previewLeave() (validate) → submitLeave() (persist PENDING).
// Balances are computed, never hand-stored (CLAUDE.md / ADR 0003).
import { z } from "zod";
import { computeAvailable, computeRemaining } from "@/core/allowance";
import { validateLeaveRequest } from "@/core/leave";
import type { DateRange, ISODate, RegionCalendar } from "@/core/types";
import { db } from "./db";

// ─── Input contract (shared with the client form + server actions) ───────────────
export const leaveInputSchema = z
  .object({
    leaveTypeId: z.string().min(1, "Choose a leave type."),
    mode: z.enum(["DAY", "HALF", "MULTI"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    halfDayPeriod: z.enum(["AM", "PM"]).optional(),
    notes: z.string().max(2000).optional(),
    // Interim: a link to a supporting document. Real upload to access-controlled storage
    // is a later story; for now we record the URL (and a 2-year purge date).
    attachmentUrl: z.string().url("Enter a valid URL.").optional().or(z.literal("")),
  })
  .refine((v) => v.mode !== "MULTI" || (v.endDate && v.endDate >= v.startDate), {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  })
  .refine((v) => v.mode !== "HALF" || !!v.halfDayPeriod, {
    message: "Choose morning or afternoon.",
    path: ["halfDayPeriod"],
  });

export type LeaveInput = z.infer<typeof leaveInputSchema>;

export interface LeaveTypeOption {
  id: string;
  name: string;
  code: string;
  color: string;
  deductsAllowance: boolean;
  noteRequired: boolean;
  attachmentRequired: boolean;
  attachmentThresholdDays: number | null;
}

export interface RequestContext {
  leaveTypes: LeaveTypeOption[];
  regionName: string;
  /** Current open allowance period summary, or null if the employee has none yet. */
  balance: { periodId: string; opening: number; remaining: number; pending: number; available: number } | null;
}

export interface PreviewResult {
  ok: boolean;
  errors: string[];
  workingDays: number;
  freeDays: number;
  allowanceDays: number; // days removed on approval (0 for non-deducting types)
  deductsAllowance: boolean;
  availableBefore: number | null;
  availableAfter: number | null;
}

export type SubmitResult = { ok: true; id: string } | { ok: false; errors: string[] };

// ─── Helpers ─────────────────────────────────────────────────────────────────────
const TYPE_SELECT = {
  id: true,
  name: true,
  code: true,
  color: true,
  deductsAllowance: true,
  noteRequired: true,
  attachmentRequired: true,
  attachmentThresholdDays: true,
} as const;

function endOf(input: LeaveInput): ISODate {
  return input.mode === "MULTI" && input.endDate ? input.endDate : input.startDate;
}

function toDate(iso: ISODate): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** A leave type is available in a region if it has no region restriction or includes it. */
function availableInRegion(regionIds: string[], regionId: string): boolean {
  return regionIds.length === 0 || regionIds.includes(regionId);
}

/** Build the region's working calendar (weekends + holidays) for the years a range spans. */
async function buildCalendar(regionId: string, startISO: ISODate, endISO: ISODate): Promise<RegionCalendar> {
  const region = await db.region.findUniqueOrThrow({ where: { id: regionId }, select: { weekendDays: true } });
  const startYear = Number(startISO.slice(0, 4));
  const endYear = Number(endISO.slice(0, 4));
  const holidayRows = await db.holiday.findMany({
    where: { regionId, year: { gte: startYear, lte: endYear } },
    select: { date: true },
  });
  const holidays = new Set<ISODate>(holidayRows.map((h) => h.date.toISOString().slice(0, 10)));
  return { weekendDays: region.weekendDays, holidays };
}

/** Current open allowance period + computed balance for an employee (null if none). */
async function loadBalance(employeeId: string): Promise<RequestContext["balance"]> {
  const period = await db.allowancePeriod.findFirst({
    where: { employeeId, endDate: null },
    orderBy: { startDate: "desc" },
  });
  if (!period) return null;

  const grouped = await db.leaveRequest.groupBy({
    by: ["status"],
    where: { allowancePeriodId: period.id, status: { in: ["APPROVED", "PENDING"] } },
    _sum: { allowanceDays: true },
  });
  const takenApproved = grouped.find((g) => g.status === "APPROVED")?._sum.allowanceDays ?? 0;
  const pending = grouped.find((g) => g.status === "PENDING")?._sum.allowanceDays ?? 0;

  const remaining = computeRemaining({
    opening: period.opening,
    carryOver: period.carryOver,
    adjustments: period.adjustments,
    takenApproved,
    deductions: period.deductions,
  });
  const available = computeAvailable(remaining, pending);
  return { periodId: period.id, opening: period.opening, remaining, pending, available };
}

/** The employee's existing PENDING/APPROVED ranges, for overlap detection. */
async function existingRanges(employeeId: string): Promise<DateRange[]> {
  const rows = await db.leaveRequest.findMany({
    where: { employeeId, status: { in: ["PENDING", "APPROVED"] } },
    select: { startDate: true, endDate: true },
  });
  return rows.map((r) => ({
    startISO: r.startDate.toISOString().slice(0, 10),
    endISO: r.endDate.toISOString().slice(0, 10),
  }));
}

// ─── Public surface ────────────────────────────────────────────────────────────
export async function getRequestContext(employeeId: string): Promise<RequestContext> {
  const employee = await db.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { regionId: true, region: { select: { name: true } } },
  });

  const types = await db.leaveType.findMany({
    where: { active: true },
    select: { ...TYPE_SELECT, regions: { select: { id: true } } },
    orderBy: { name: "asc" },
  });

  const leaveTypes: LeaveTypeOption[] = types
    .filter((t) => availableInRegion(t.regions.map((r) => r.id), employee.regionId))
    .map(({ regions: _regions, ...t }) => t);

  return { leaveTypes, regionName: employee.region.name, balance: await loadBalance(employeeId) };
}

/**
 * Validate a request without persisting. Authoritative: the UI calls this for the
 * "Check details" step, and submitLeave() re-runs the same checks before writing.
 */
export async function previewLeave(employeeId: string, rawInput: LeaveInput): Promise<PreviewResult> {
  const empty: PreviewResult = {
    ok: false,
    errors: [],
    workingDays: 0,
    freeDays: 0,
    allowanceDays: 0,
    deductsAllowance: false,
    availableBefore: null,
    availableAfter: null,
  };

  const parsed = leaveInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ...empty, errors: parsed.error.issues.map((i) => i.message) };
  }
  const input = parsed.data;

  const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { regionId: true } });
  const type = await db.leaveType.findUnique({
    where: { id: input.leaveTypeId },
    select: { ...TYPE_SELECT, active: true, regions: { select: { id: true } } },
  });
  if (!type || !type.active || !availableInRegion(type.regions.map((r) => r.id), employee.regionId)) {
    return { ...empty, errors: ["That leave type isn't available for your region."] };
  }

  const endISO = endOf(input);
  const calendar = await buildCalendar(employee.regionId, input.startDate, endISO);
  const balance = await loadBalance(employeeId);

  // Deducting leave with no allowance period can't be costed — block early and clearly.
  if (type.deductsAllowance && !balance) {
    return { ...empty, deductsAllowance: true, errors: ["You don't have an allowance period yet. Contact HR."] };
  }
  const available = balance?.available ?? 0;

  const result = validateLeaveRequest({
    startISO: input.startDate,
    endISO,
    mode: input.mode,
    cal: calendar,
    deductsAllowance: type.deductsAllowance,
    available,
    existing: await existingRanges(employeeId),
    noteRequired: type.noteRequired,
    note: input.notes,
    attachmentRequired: type.attachmentRequired,
    attachmentThresholdDays: type.attachmentThresholdDays,
    hasAttachment: !!input.attachmentUrl,
  });

  const availableBefore = type.deductsAllowance ? available : null;
  const availableAfter = availableBefore === null ? null : computeAvailable(availableBefore, result.allowanceDays);

  return {
    ok: result.ok,
    errors: result.errors,
    workingDays: result.workingDays,
    freeDays: result.freeDays,
    allowanceDays: result.allowanceDays,
    deductsAllowance: type.deductsAllowance,
    availableBefore,
    availableAfter,
  };
}

/** Re-validate and persist a PENDING request. Never trusts a prior preview. */
export async function submitLeave(employeeId: string, rawInput: LeaveInput): Promise<SubmitResult> {
  const preview = await previewLeave(employeeId, rawInput);
  if (!preview.ok) return { ok: false, errors: preview.errors };

  const input = leaveInputSchema.parse(rawInput); // safe: preview already validated
  const endISO = endOf(input);
  const balance = await loadBalance(employeeId);
  const attachmentUrl = input.attachmentUrl ? input.attachmentUrl : null;
  const attachmentExpiresAt = attachmentUrl
    ? new Date(Date.UTC(toDate(input.startDate).getUTCFullYear() + 2, toDate(input.startDate).getUTCMonth(), toDate(input.startDate).getUTCDate()))
    : null;

  const created = await db.leaveRequest.create({
    data: {
      employeeId,
      leaveTypeId: input.leaveTypeId,
      startDate: toDate(input.startDate),
      endDate: toDate(endISO),
      durationMode: input.mode,
      halfDayPeriod: input.mode === "HALF" ? input.halfDayPeriod : null,
      workingDays: preview.workingDays,
      freeDays: preview.freeDays,
      allowanceDays: preview.allowanceDays,
      notes: input.notes?.trim() || null,
      attachmentUrl,
      attachmentExpiresAt,
      status: "PENDING", // allowance is debited only on approval (Epic 5.4)
      allowancePeriodId: preview.deductsAllowance ? (balance?.periodId ?? null) : null,
      createdById: employeeId,
    },
    select: { id: true },
  });

  // NOTE: approver notification (email + Teams DM) is Epic 11 — wired here later.
  return { ok: true, id: created.id };
}
