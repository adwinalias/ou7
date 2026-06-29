// Story 26.4 — Min length & max consecutive days: integration tests.
// minLengthDays: 1-day request blocked, 2-day succeeds.
// maxConsecutiveDays: 5-day request blocked, 3-day succeeds.
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
if (!dbUp) console.warn("[length-limits.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "ll264-it-";
const CODE_MIN2  = "LL2MN"; // minLengthDays: 2
const CODE_MAX3  = "LL3MX"; // maxConsecutiveDays: 3

let employeeId = "";
let min2TypeId = "";
let max3TypeId = "";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Return a working day offset far enough into the future to pass noticePeriod=0.
// The UAE region seeded by this test has weekendDays [6, 0] = Sat(6) + Sun(0); Friday
// is a WORKING day. The skip set MUST match the region calendar — skipping Friday too
// lets a request range straddle a working Friday, inflating the engine's workingDays
// count and misfiring maxConsecutiveDays on dates where the window crosses a weekend.
const WEEKEND = [6, 0]; // must match the UAE region weekendDays below
function futureWeekday(offsetStart = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetStart);
  while (WEEKEND.includes(d.getDay())) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

// Add N calendar days to an ISO date string.
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

// Next working day after a given ISO (skip the UAE weekend Sat+Sun).
function nextWeekday(iso: string): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setDate(d.getDate() + 1);
  while (WEEKEND.includes(d.getDay())) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

function input(leaveTypeId: string, startDate: string, endDate?: string): LeaveInput {
  if (endDate && endDate !== startDate) {
    return { mode: "MULTI", startDate, endDate, leaveTypeId };
  }
  return { mode: "DAY", startDate, leaveTypeId };
}

suite("Story 26.4 — minLengthDays & maxConsecutiveDays enforcement (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_MIN2, CODE_MAX3] } } });

    // Non-deducting types — no allowance needed, isolates the length rule.
    min2TypeId = (
      await db.leaveType.create({
        data: {
          name: "LL26 Min 2 days",
          code: CODE_MIN2,
          color: "#2F6FEB",
          deductsAllowance: false,
          minLengthDays: 2,
        },
      })
    ).id;

    max3TypeId = (
      await db.leaveType.create({
        data: {
          name: "LL26 Max 3 days",
          code: CODE_MAX3,
          color: "#E8833A",
          deductsAllowance: false,
          maxConsecutiveDays: 3,
        },
      })
    ).id;

    employeeId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}staff@interestingtimes.me`,
          firstName: "LL",
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
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_MIN2, CODE_MAX3] } } });
    await db.$disconnect();
  });

  // ── minLengthDays: 2 ──────────────────────────────────────────────────────

  it("minLengthDays=2: a 1-day request is blocked with the right error", async () => {
    const startDate = futureWeekday(10);
    const res = await previewLeave(employeeId, input(min2TypeId, startDate));
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/at least 2 working day/i);
  });

  it("minLengthDays=2: a 1-day request is not created", async () => {
    const startDate = futureWeekday(10);
    const res = await submitLeave(employeeId, input(min2TypeId, startDate));
    expect(res.ok).toBe(false);
    const count = await db.leaveRequest.count({ where: { employeeId } });
    expect(count).toBe(0);
  });

  it("minLengthDays=2: a 2-day (MULTI) request on consecutive weekdays succeeds", async () => {
    const start = futureWeekday(10);
    const end = nextWeekday(start);
    const res = await previewLeave(employeeId, input(min2TypeId, start, end));
    // Length rule should not fire (workingDays = 2 ≥ minLengthDays = 2).
    expect(res.errors.some((e) => /at least.*working day/i.test(e))).toBe(false);
    expect(res.workingDays).toBeGreaterThanOrEqual(2);
  });

  // ── maxConsecutiveDays: 3 ─────────────────────────────────────────────────

  it("maxConsecutiveDays=3: a 5-working-day MULTI request is blocked", async () => {
    // Build 5 consecutive weekdays starting from futureWeekday(10).
    const d0 = futureWeekday(10);
    let d = d0;
    for (let i = 0; i < 4; i++) d = nextWeekday(d);
    const end = d; // 5th weekday from d0
    const res = await previewLeave(employeeId, input(max3TypeId, d0, end));
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/at most 3 consecutive working day/i);
  });

  it("maxConsecutiveDays=3: a 5-day request is not created", async () => {
    const d0 = futureWeekday(10);
    let d = d0;
    for (let i = 0; i < 4; i++) d = nextWeekday(d);
    const res = await submitLeave(employeeId, input(max3TypeId, d0, d));
    expect(res.ok).toBe(false);
    const count = await db.leaveRequest.count({ where: { employeeId } });
    expect(count).toBe(0);
  });

  it("maxConsecutiveDays=3: a 3-working-day MULTI request succeeds", async () => {
    const d0 = futureWeekday(10);
    let d = d0;
    for (let i = 0; i < 2; i++) d = nextWeekday(d);
    const end = d; // 3rd weekday from d0
    const res = await previewLeave(employeeId, input(max3TypeId, d0, end));
    // Max-consec rule should not fire.
    expect(res.errors.some((e) => /at most.*consecutive/i.test(e))).toBe(false);
    expect(res.workingDays).toBeGreaterThanOrEqual(3);
  });
});
