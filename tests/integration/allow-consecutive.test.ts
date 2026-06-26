// Story 26.5 — Allow-consecutive-bookings toggle: integration tests.
// allowConsecutive=false: abutting same-type request BLOCKED; gap of 1 working day ALLOWED.
// allowConsecutive=true (default): abutting same-type request ALLOWED.
// Self-skips when the DB is unreachable (same pattern as sibling integration tests).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { previewLeave, submitLeave, type LeaveInput } from "@/lib/leave";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[allow-consecutive.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "ac265-it-";
const CODE_NO  = "AC5NO"; // allowConsecutive: false
const CODE_YES = "AC5YS"; // allowConsecutive: true (default)

let employeeId = "";
let noConsecTypeId = "";
let yesConsecTypeId = "";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Return a weekday (Mon–Thu UAE) starting at least offsetStart calendar days from today.
// UAE weekends: Sat(6) + Sun(0). Skip those.
function futureWeekday(offsetStart = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetStart);
  while ([5, 6, 0].includes(d.getDay())) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

// Next UAE weekday after iso (skip Fri, Sat, Sun).
function nextWeekday(iso: string): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setDate(d.getDate() + 1);
  while ([5, 6, 0].includes(d.getDay())) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

// The calendar day immediately after iso (may be a weekend).
function calDayAfter(iso: string): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

function input(leaveTypeId: string, startDate: string, endDate?: string): LeaveInput {
  if (endDate && endDate !== startDate) {
    return { mode: "MULTI", startDate, endDate, leaveTypeId };
  }
  return { mode: "DAY", startDate, leaveTypeId };
}

suite("Story 26.5 — allowConsecutive enforcement (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_NO, CODE_YES] } } });

    // Non-deducting types — no allowance needed; isolates the consecutive rule.
    noConsecTypeId = (
      await db.leaveType.create({
        data: {
          name: "AC26 No Consecutive",
          code: CODE_NO,
          color: "#D93025",
          deductsAllowance: false,
          allowConsecutive: false,
        },
      })
    ).id;

    yesConsecTypeId = (
      await db.leaveType.create({
        data: {
          name: "AC26 Allow Consecutive",
          code: CODE_YES,
          color: "#2F6FEB",
          deductsAllowance: false,
          allowConsecutive: true,
        },
      })
    ).id;

    employeeId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}staff@interestingtimes.me`,
          firstName: "AC",
          lastName: "Tester",
          regionId: uae.id,
          joiningDate: day("2024-01-01"),
          role: "STAFF",
        },
      })
    ).id;
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId } });
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId } });
    await db.allowancePeriod.deleteMany({ where: { employeeId } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_NO, CODE_YES] } } });
    await db.$disconnect();
  });

  // ── allowConsecutive=false: abutting second booking is blocked ─────────────

  it("allowConsecutive=false: a second request directly abutting (same type, PENDING) is blocked", async () => {
    // Book first request (day A). It will be PENDING (requiresApproval defaults to true).
    const dayA = futureWeekday(10);
    const first = await submitLeave(employeeId, input(noConsecTypeId, dayA));
    expect(first.ok).toBe(true);

    // Day immediately after dayA (calendar day) — abuts with no working day between.
    // If dayA is Mon–Thu, the next calendar day is a working day too (Tue–Fri), so adjacent.
    const dayB = calDayAfter(dayA);
    const res = await previewLeave(employeeId, input(noConsecTypeId, dayB));
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/can't be booked back-to-back/i);
  });

  it("allowConsecutive=false: the abutting second request is not created", async () => {
    const dayA = futureWeekday(10);
    await submitLeave(employeeId, input(noConsecTypeId, dayA));

    const dayB = calDayAfter(dayA);
    const res = await submitLeave(employeeId, input(noConsecTypeId, dayB));
    expect(res.ok).toBe(false);
    // Only the first request exists.
    const count = await db.leaveRequest.count({ where: { employeeId } });
    expect(count).toBe(1);
  });

  it("allowConsecutive=false: a second request separated by a working day is allowed", async () => {
    // Book first request on dayA.
    const dayA = futureWeekday(10);
    await submitLeave(employeeId, input(noConsecTypeId, dayA));

    // Skip one working day (dayA+1 working = gap), then book dayC = working day after the gap.
    const gap = nextWeekday(dayA);   // first working day after dayA (the gap day)
    const dayC = nextWeekday(gap);   // second working day after dayA (dayC has a gap between)
    const res = await previewLeave(employeeId, input(noConsecTypeId, dayC));
    // The consecutive error must not appear.
    expect(res.errors.some((e) => /can't be booked back-to-back/i.test(e))).toBe(false);
    // Must be valid (other errors like notice, balance etc. should not fire on non-deducting type).
    expect(res.ok).toBe(true);
  });

  // ── allowConsecutive=true: abutting second booking is allowed ─────────────

  it("allowConsecutive=true: a second request directly abutting (same type) is allowed", async () => {
    const dayA = futureWeekday(10);
    const first = await submitLeave(employeeId, input(yesConsecTypeId, dayA));
    expect(first.ok).toBe(true);

    const dayB = calDayAfter(dayA);
    const res = await previewLeave(employeeId, input(yesConsecTypeId, dayB));
    // No back-to-back error.
    expect(res.errors.some((e) => /can't be booked back-to-back/i.test(e))).toBe(false);
  });

  // ── allowConsecutive=false: different leave type adjacent is NOT blocked ──

  it("allowConsecutive=false: adjacent request of a DIFFERENT type is not blocked", async () => {
    const dayA = futureWeekday(10);
    // Seed a DIFFERENT type (yesConsecType) on dayA.
    // The next preview is for noConsecType (allowConsecutive=false) on the abutting dayB.
    // sameTypeRanges for noConsecType must be empty (yesConsecType seeded, not noConsecType),
    // so the consecutive rule must NOT fire — this directly tests the leaveTypeId filter.
    const first = await submitLeave(employeeId, input(yesConsecTypeId, dayA));
    expect(first.ok).toBe(true);

    const dayB = calDayAfter(dayA);
    const res = await previewLeave(employeeId, input(noConsecTypeId, dayB));
    expect(res.errors.some((e) => /can't be booked back-to-back/i.test(e))).toBe(false);
    expect(res.ok).toBe(true);
  });
});
