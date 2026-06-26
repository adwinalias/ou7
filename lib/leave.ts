import "server-only"; // Epic 22.4: DB-backed leave orchestration — server-only (types are imported via `import type`, which is erased).
// Leave request orchestration (Epic 5.1–5.3). All I/O lives here; the actual rules are
// the already-tested pure functions in core/leave and core/allowance. The flow is:
//   app/request → previewLeave() (validate) → submitLeave() (persist PENDING).
// Balances are computed, never hand-stored (CLAUDE.md / ADR 0003).
import { z } from "zod";
import { computeAvailable } from "@/core/allowance";
import { decideLeave, OVER_COMMIT_MESSAGE } from "@/core/approvals";
import { canAddLeaveForOthers } from "@/core/authz";
import { validateLeaveRequest } from "@/core/leave";
import type { Actor, DateRange, ISODate, RegionCalendar } from "@/core/types";
import { getOpenPeriodBalance, periodBalanceExcluding } from "./allowance";
import { recordAudit } from "./audit";
import { getRestrictedRangesFor } from "./calendars";
import { db } from "./db";
import { AuthError } from "./rbac";

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
  noticePeriodDays: true,
  minLengthDays: true,
  maxConsecutiveDays: true,
  allowConsecutive: true,
} as const;

// ponytail: mirrors dubaiToday() in lib/cancellation.ts — one-liner, no shared dep needed
const dubaiToday = (): ISODate => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });

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
  const b = await getOpenPeriodBalance(employeeId);
  return b ? { periodId: b.periodId, opening: b.opening, remaining: b.remaining, pending: b.pending, available: b.available } : null;
}

/** The employee's existing PENDING/APPROVED ranges, for overlap detection.
 *  Returns raw rows so callers can also build a same-type subset (story 26.5). */
async function existingRanges(employeeId: string): Promise<Array<DateRange & { leaveTypeId: string }>> {
  const rows = await db.leaveRequest.findMany({
    where: { employeeId, status: { in: ["PENDING", "APPROVED"] } },
    select: { startDate: true, endDate: true, leaveTypeId: true },
  });
  return rows.map((r) => ({
    startISO: r.startDate.toISOString().slice(0, 10),
    endISO: r.endDate.toISOString().slice(0, 10),
    leaveTypeId: r.leaveTypeId,
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

  const allRanges = await existingRanges(employeeId);
  const result = validateLeaveRequest({
    startISO: input.startDate,
    endISO,
    mode: input.mode,
    cal: calendar,
    deductsAllowance: type.deductsAllowance,
    available,
    existing: allRanges,
    restricted: await getRestrictedRangesFor(employeeId, input.startDate, endISO),
    noteRequired: type.noteRequired,
    note: input.notes,
    attachmentRequired: type.attachmentRequired,
    attachmentThresholdDays: type.attachmentThresholdDays,
    hasAttachment: !!input.attachmentUrl,
    todayISO: dubaiToday(),
    noticePeriodDays: type.noticePeriodDays,
    minLengthDays: type.minLengthDays ?? undefined,
    maxConsecutiveDays: type.maxConsecutiveDays ?? undefined,
    allowConsecutive: type.allowConsecutive,
    sameTypeRanges: allRanges.filter((r) => r.leaveTypeId === type.id),
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

/** Re-validate and persist a PENDING (or APPROVED for no-approval types) request. Never trusts a prior preview. */
export async function submitLeave(
  employeeId: string,
  rawInput: LeaveInput,
  opts: { createdById?: string } = {},
): Promise<SubmitResult> {
  const preview = await previewLeave(employeeId, rawInput);
  if (!preview.ok) return { ok: false, errors: preview.errors };

  const input = leaveInputSchema.parse(rawInput); // safe: preview already validated
  const endISO = endOf(input);
  const balance = await loadBalance(employeeId);
  const attachmentUrl = input.attachmentUrl ? input.attachmentUrl : null;
  const attachmentExpiresAt = attachmentUrl
    ? new Date(Date.UTC(toDate(input.startDate).getUTCFullYear() + 2, toDate(input.startDate).getUTCMonth(), toDate(input.startDate).getUTCDate()))
    : null;

  // Look up requiresApproval for the chosen type (not in the preview shape; fetch it directly).
  const lt = await db.leaveType.findUniqueOrThrow({ where: { id: input.leaveTypeId }, select: { requiresApproval: true, deductsAllowance: true } });
  const autoApprove = !lt.requiresApproval;

  const actorId = opts.createdById ?? employeeId;
  const sharedData = {
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
    allowancePeriodId: preview.deductsAllowance ? (balance?.periodId ?? null) : null,
    createdById: actorId,
  } as const;

  if (autoApprove && lt.deductsAllowance && balance) {
    // Mirror decideLeaveRequest exactly: lock period → balance re-check → write APPROVED → audit,
    // all in ONE transaction so concurrent auto-approves serialize on the same period row.
    const outcome = await db.$transaction(async (tx) => {
      // Lock the period row — same pattern as lib/approvals.ts decideLeaveRequest.
      await tx.$queryRaw`SELECT id FROM "AllowancePeriod" WHERE id = ${balance.periodId} FOR UPDATE`;
      const { remainingExclR, otherPending } = await periodBalanceExcluding(tx, balance.periodId, "");
      const check = decideLeave({
        currentStatus: "PENDING",
        action: "APPROVE",
        deductsAllowance: true,
        allowanceDays: preview.allowanceDays,
        remainingExclR,
        otherPending,
      });
      if (!check.ok) return { ok: false as const, errors: check.errors.length ? check.errors : [OVER_COMMIT_MESSAGE] };

      const created = await tx.leaveRequest.create({
        data: { ...sharedData, status: "APPROVED", decisionAt: new Date(), decisionById: actorId },
        select: { id: true },
      });
      await recordAudit(tx, {
        actorId,
        action: "LEAVE_AUTO_APPROVED",
        entity: "LeaveRequest",
        entityId: created.id,
        after: { status: "APPROVED", leaveTypeId: input.leaveTypeId, employeeId, reason: "requiresApproval=false" },
      });
      return { ok: true as const, id: created.id };
    });
    return outcome;
  }

  if (autoApprove) {
    // Non-deducting auto-approve: no balance to lock; create APPROVED + audit outside a transaction.
    const created = await db.leaveRequest.create({
      data: { ...sharedData, status: "APPROVED", decisionAt: new Date(), decisionById: actorId },
      select: { id: true },
    });
    await recordAudit(db, {
      actorId,
      action: "LEAVE_AUTO_APPROVED",
      entity: "LeaveRequest",
      entityId: created.id,
      after: { status: "APPROVED", leaveTypeId: input.leaveTypeId, employeeId, reason: "requiresApproval=false" },
    });
    return { ok: true, id: created.id };
  }

  // requiresApproval=true: normal PENDING path, unchanged.
  const created = await db.leaveRequest.create({
    data: { ...sharedData, status: "PENDING" },
    select: { id: true },
  });

  // NOTE: approver notification (email + Teams DM) is Epic 11 — wired here later.
  return { ok: true, id: created.id };
}

/**
 * Add leave on behalf of another employee (Epic 9.3). Authorized for HR or approvers with
 * the +Add level (core/authz.canAddLeaveForOthers). Goes through the SAME validation +
 * PENDING create as a self-request (so over-booking/restricted/conflict rules all apply);
 * unpaid leave is simply added as a PENDING (unapproved) request and notified on approval
 * via the existing decide path. The creation is audited.
 */
export async function addLeaveOnBehalf(actor: Actor, targetEmployeeId: string, rawInput: LeaveInput): Promise<SubmitResult> {
  if (!canAddLeaveForOthers(actor)) throw new AuthError(403, "You don't have permission to add leave for others.");
  const res = await submitLeave(targetEmployeeId, rawInput, { createdById: actor.employeeId });
  if (res.ok) {
    await recordAudit(db, {
      actorId: actor.employeeId,
      action: "LEAVE_CREATE_ON_BEHALF",
      entity: "LeaveRequest",
      entityId: res.id,
      after: { employeeId: targetEmployeeId, leaveTypeId: rawInput.leaveTypeId, startDate: rawInput.startDate },
    });
  }
  return res;
}
