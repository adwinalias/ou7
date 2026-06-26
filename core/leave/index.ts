// Leave request validation — composes the calendar + allowance engine + policy rules.
// Pure: returns errors; performs no I/O. The API layer fetches data and calls this.
import { canBook } from "../allowance";
import { countDays, isWorkingDay } from "../calendar";
import { addDays, eachDate, parseISO, rangesOverlap, toISO } from "../dates";
import type { DateRange, DurationMode, ISODate, RegionCalendar, RestrictedRange } from "../types";

// ── Coverage check (ADR-0014, story 28.1) ────────────────────────────────────

export interface CoverageInput {
  /** Department minimum present headcount; null = no check. */
  minStaffing: number | null;
  /** Maximum department members off on any single day (incl. requester); null = no check. */
  maxLeavePerDay: number | null;
  /** Active department members INCLUDING the requester. */
  headcount: number;
  startISO: ISODate;
  endISO: ISODate;
  mode: DurationMode;
  cal: RegionCalendar;
  /** Count of OTHER dept members on staffing-affecting leave, keyed by ISO day. */
  absentByDay: Record<ISODate, number>;
}

export interface CoverageResult {
  breachedDays: ISODate[];
  /** Advisory warning strings (0–2 entries). Never drives ok:false. */
  warnings: string[];
}

/**
 * Advisory-only coverage check (ADR-0014 §1). Never blocks; callers surface the
 * warning in the UI and record it on audit, but ok/nextStatus are unaffected.
 *
 * ponytail: half-day absence = full absence for integer headcount (conservative).
 * Half-day awareness lives in which DAYS the request occupies (via mode + calendar),
 * not in fractional presence arithmetic.
 */
export function assessCoverage(input: CoverageInput): CoverageResult {
  // ponytail: skip all work if both checks are disabled.
  if (input.minStaffing === null && input.maxLeavePerDay === null) return { breachedDays: [], warnings: [] };

  const rangeEnd = input.mode === "DAY" ? input.startISO : input.endISO;
  const minBreached = new Set<ISODate>();
  const maxBreached = new Set<ISODate>();

  for (const d of eachDate(input.startISO, rangeEnd)) {
    if (!isWorkingDay(d, input.cal)) continue;
    const iso = toISO(d);
    const otherAbsent = input.absentByDay[iso] ?? 0;

    if (input.minStaffing !== null) {
      // Subtract other absentees AND this requester (−1).
      const present = input.headcount - otherAbsent - 1;
      if (present < input.minStaffing) minBreached.add(iso);
    }

    if (input.maxLeavePerDay !== null) {
      // Total off on this day = other absentees + this requester.
      const totalOff = otherAbsent + 1;
      if (totalOff > input.maxLeavePerDay) maxBreached.add(iso);
    }
  }

  // Union of breached days, sorted.
  const breachedDays = [...new Set([...minBreached, ...maxBreached])].sort();

  const warnings: string[] = [];
  if (minBreached.size > 0) {
    warnings.push(`This booking drops the department below its minimum staffing (${input.minStaffing}) on ${minBreached.size} day(s).`);
  }
  if (maxBreached.size > 0) {
    warnings.push(`This booking exceeds the department's maximum of ${input.maxLeavePerDay} people off on ${maxBreached.size} day(s).`);
  }

  return { breachedDays, warnings };
}

// ── Clash check (ADR-0014, story 29.2) ───────────────────────────────────────

/** A restricted counterpart's overlapping PENDING/APPROVED leave range. */
export interface ClashCounterpart {
  name: string;
  startISO: ISODate;
  endISO: ISODate;
}

export interface ClashInput {
  startISO: ISODate;
  endISO: ISODate;
  mode: DurationMode;
  cal: RegionCalendar;
  counterparts: ClashCounterpart[];
}

export interface ClashResult {
  hasClash: boolean;
  clashedNames: string[];
  /** Union of shared working days across all clashing counterparts, sorted. */
  sharedDays: ISODate[];
  message: string | null;
}

/**
 * Hard-gate clash check (ADR-0014 §1). Returns hasClash=true when ANY counterpart
 * shares ≥1 working day with the request. Message names the people only, never their
 * leave type (visibility rule). Empty counterparts → no clash.
 *
 * ponytail: reuses rangesOverlap (fast rejection) + isWorkingDay (region calendar).
 */
export function assessClash(input: ClashInput): ClashResult {
  if (input.counterparts.length === 0) return { hasClash: false, clashedNames: [], sharedDays: [], message: null };

  // For HALF mode the request occupies exactly startISO; for DAY the same; MULTI is start→end.
  const reqEnd = input.mode === "MULTI" ? input.endISO : input.startISO;

  const clashedNames: string[] = [];
  const sharedDaySet = new Set<ISODate>();

  for (const cp of input.counterparts) {
    // Skip counterparts with no calendar overlap at all.
    if (!rangesOverlap(input.startISO, reqEnd, cp.startISO, cp.endISO)) continue;

    // Find shared working days within both ranges.
    // Overlap window = max(starts) → min(ends).
    const winStart = input.startISO > cp.startISO ? input.startISO : cp.startISO;
    const winEnd   = reqEnd < cp.endISO ? reqEnd : cp.endISO;

    let hasSharedWorkingDay = false;
    for (const d of eachDate(winStart, winEnd)) {
      if (isWorkingDay(d, input.cal)) {
        sharedDaySet.add(toISO(d));
        hasSharedWorkingDay = true;
      }
    }

    if (hasSharedWorkingDay) clashedNames.push(cp.name);
  }

  if (clashedNames.length === 0) return { hasClash: false, clashedNames: [], sharedDays: [], message: null };

  const sharedDays = [...sharedDaySet].sort();
  const names = clashedNames.join(", ");
  const message = `You can't be off at the same time as ${names} (${sharedDays.length} shared working day(s)).`;

  return { hasClash: true, clashedNames, sharedDays, message };
}

export interface LeaveValidationInput {
  startISO: ISODate;
  endISO: ISODate;
  mode: DurationMode;
  cal: RegionCalendar;
  deductsAllowance: boolean;
  available: number;
  existing: DateRange[]; // the employee's current approved/pending ranges
  restricted?: RestrictedRange[]; // company/department/region blackout ranges (Epic 10.2)
  noteRequired?: boolean;
  note?: string;
  attachmentRequired?: boolean;
  attachmentThresholdDays?: number | null;
  hasAttachment?: boolean;
  /** "Today" in Asia/Dubai as YYYY-MM-DD. Must be provided together with noticePeriodDays. */
  todayISO?: ISODate;
  /** Calendar days of notice required. Negative = allow backdating by |n| days. */
  noticePeriodDays?: number;
  /** Minimum working days per request. A HALF (0.5) request fails minLengthDays: 1. */
  minLengthDays?: number;
  /** Maximum consecutive working days per request. */
  maxConsecutiveDays?: number;
  /** Story 26.5: when false, consecutive same-type bookings with no working day between are blocked. */
  allowConsecutive?: boolean;
  /** Story 26.5: existing PENDING/APPROVED ranges of the same leave type for this employee. */
  sameTypeRanges?: DateRange[];
  /**
   * Story 28.1/28.2: optional coverage check inputs (ADR-0014). Advisory only — never sets ok:false.
   * startISO/endISO/mode/cal are inherited from the request; only supply dept-specific fields.
   */
  coverage?: Pick<CoverageInput, "minStaffing" | "maxLeavePerDay" | "headcount" | "absentByDay">;
  /**
   * Story 29.2: optional clash check inputs (ADR-0014). Advisory warning at preview — never sets ok:false.
   * startISO/endISO/mode/cal are inherited from the request; only supply counterparts.
   */
  clash?: Pick<ClashInput, "counterparts">;
}

/**
 * Returns true when two non-overlapping ranges have zero working days strictly between them.
 * "Strictly between" = days after the earlier end and before the later start.
 * ponytail: inline gap iteration; no extra abstraction needed for one call site.
 */
function isAdjacentRange(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate, cal: RegionCalendar): boolean {
  // Determine which range comes first.
  const [earlyEnd, lateStart] = aEnd < bStart ? [aEnd, bStart] : [bEnd, aStart];
  // Gap = day after earlyEnd … day before lateStart.
  const gapStart = toISO(addDays(parseISO(earlyEnd), 1));
  const gapEnd   = toISO(addDays(parseISO(lateStart), -1));
  // Ranges abut directly (no calendar days between them).
  if (gapStart > gapEnd) return true;
  // Gap exists; adjacent only if every gap day is a non-working day.
  for (const d of eachDate(gapStart, gapEnd)) {
    if (isWorkingDay(d, cal)) return false;
  }
  return true;
}

export interface LeaveValidationResult {
  ok: boolean;
  errors: string[];
  /** Advisory warnings (e.g. coverage breach). Never drives ok:false. */
  warnings: string[];
  workingDays: number;
  freeDays: number;
  allowanceDays: number;
}

export function validateLeaveRequest(input: LeaveValidationInput): LeaveValidationResult {
  const errors: string[] = [];
  const { workingDays, freeDays } = countDays(input.startISO, input.endISO, input.mode, input.cal);
  const allowanceDays = input.deductsAllowance ? workingDays : 0;

  if (workingDays <= 0) {
    errors.push("This request covers only non-working days.");
  } else {
    // Length limits (story 26.4) — only checked when workingDays > 0.
    if (input.minLengthDays != null && input.minLengthDays > 0 && workingDays < input.minLengthDays) {
      errors.push(`This leave type requires at least ${input.minLengthDays} working day(s).`);
    }
    if (input.maxConsecutiveDays != null && input.maxConsecutiveDays > 0 && workingDays > input.maxConsecutiveDays) {
      errors.push(`This leave type allows at most ${input.maxConsecutiveDays} consecutive working day(s).`);
    }
  }

  if (input.existing.some((r) => rangesOverlap(input.startISO, input.endISO, r.startISO, r.endISO))) {
    errors.push("Leave already requested for these/this date(s).");
  }

  // Story 26.5: block consecutive same-type bookings when allowConsecutive is false.
  if (
    input.allowConsecutive === false &&
    input.sameTypeRanges?.some((r) =>
      isAdjacentRange(input.startISO, input.endISO, r.startISO, r.endISO, input.cal),
    )
  ) {
    errors.push("This leave type can't be booked back-to-back with adjacent leave of the same type.");
  }

  // Restricted / blackout days (Epic 10.2): block when the requested range hits one.
  for (const r of input.restricted ?? []) {
    if (rangesOverlap(input.startISO, input.endISO, r.startISO, r.endISO)) {
      errors.push(r.reason ? `Leave overlaps a restricted period: ${r.reason}.` : "Leave overlaps a restricted period.");
    }
  }

  if (allowanceDays > 0 && !canBook(input.available, allowanceDays)) {
    errors.push("This exceeds your available balance.");
  }

  // Notice period check — calendar days only, no working-day logic (story 26.2).
  if (input.todayISO != null && input.noticePeriodDays != null) {
    const earliestStartISO = toISO(addDays(parseISO(input.todayISO), input.noticePeriodDays));
    if (input.startISO < earliestStartISO) {
      if (input.noticePeriodDays >= 0) {
        errors.push(`This leave type needs at least ${input.noticePeriodDays} day(s) notice.`);
      } else {
        errors.push(`This leave type can't be booked more than ${Math.abs(input.noticePeriodDays)} day(s) in the past.`);
      }
    }
  }

  if (input.noteRequired && !input.note?.trim()) {
    errors.push("A note is required for this leave type.");
  }

  const needsDoc =
    !!input.attachmentRequired &&
    (input.attachmentThresholdDays == null || workingDays > input.attachmentThresholdDays);
  if (needsDoc && !input.hasAttachment) {
    errors.push("A supporting document is required.");
  }

  // Coverage check (ADR-0014, story 28.1) — advisory only; never sets ok:false.
  const warnings: string[] = [];
  if (input.coverage) {
    const cv = assessCoverage({ ...input.coverage, startISO: input.startISO, endISO: input.endISO, mode: input.mode, cal: input.cal });
    warnings.push(...cv.warnings);
  }

  // Clash check (ADR-0014, story 29.2) — advisory warning at preview; never sets ok:false here.
  if (input.clash) {
    const cl = assessClash({ ...input.clash, startISO: input.startISO, endISO: input.endISO, mode: input.mode, cal: input.cal });
    if (cl.message) warnings.push(cl.message);
  }

  return { ok: errors.length === 0, errors, warnings, workingDays, freeDays, allowanceDays };
}
