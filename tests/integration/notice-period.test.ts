// Story 26.2 — Notice period enforcement: integration tests.
// noticePeriodDays > 0 → blocks requests starting sooner than today + N days.
// noticePeriodDays < 0 → allows backdating up to |N| days, blocks beyond that.
// noticePeriodDays = 0 → no restriction (default).
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
if (!dbUp) console.warn("[notice-period.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "np26-it-";
const CODE_NOTICE5 = "NP265";   // noticePeriodDays: 5
const CODE_PAST3   = "NP26P";   // noticePeriodDays: -3
const CODE_ZERO    = "NP26Z";   // noticePeriodDays: 0 (default)

let employeeId = "";
let notice5Id = "";
let past3Id = "";
let zeroId = "";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Get today in Asia/Dubai as YYYY-MM-DD (mirrors dubaiToday in lib/leave.ts).
function dubaiToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

// Return a date offset from today by N calendar days (positive = future, negative = past).
function dateOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

function input(leaveTypeId: string, startDate: string, opts: Partial<LeaveInput> = {}): LeaveInput {
  return { mode: "DAY", startDate, leaveTypeId, ...opts };
}

suite("Story 26.2 — noticePeriodDays enforcement (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_NOTICE5, CODE_PAST3, CODE_ZERO] } } });

    notice5Id = (
      await db.leaveType.create({
        data: { name: "NP26 5-day notice", code: CODE_NOTICE5, color: "#2F6FEB", deductsAllowance: false, noticePeriodDays: 5 },
      })
    ).id;

    past3Id = (
      await db.leaveType.create({
        data: { name: "NP26 Allow 3 past", code: CODE_PAST3, color: "#E8833A", deductsAllowance: false, noticePeriodDays: -3 },
      })
    ).id;

    zeroId = (
      await db.leaveType.create({
        data: { name: "NP26 Zero notice", code: CODE_ZERO, color: "#7C3AED", deductsAllowance: false, noticePeriodDays: 0 },
      })
    ).id;

    employeeId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}staff@interestingtimes.me`,
          firstName: "NP",
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
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_NOTICE5, CODE_PAST3, CODE_ZERO] } } });
    await db.$disconnect();
  });

  // ── noticePeriodDays: 5 ────────────────────────────────────────────────────

  it("noticePeriodDays=5: blocks a request starting < 5 days from today", async () => {
    const tomorrow = dateOffset(1);
    const res = await previewLeave(employeeId, input(notice5Id, tomorrow));
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/5 day/i);
  });

  it("noticePeriodDays=5: blocks a request starting today", async () => {
    const today = dubaiToday();
    const res = await previewLeave(employeeId, input(notice5Id, today));
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/5 day/i);
  });

  it("noticePeriodDays=5: allows a request starting exactly today + 5 days", async () => {
    // Find a weekday at +5 or beyond (UAE weekend = Fri/Sat, skip to next Mon if needed).
    const startDate = dateOffset(5);
    const res = await previewLeave(employeeId, input(notice5Id, startDate));
    // May still fail if the date falls on a weekend — that's a calendar rule, not notice. We
    // only assert the notice error is absent.
    expect(res.errors.some((e) => /day.*notice|notice.*day/i.test(e))).toBe(false);
  });

  it("noticePeriodDays=5: submit blocked — request is not created", async () => {
    const tomorrow = dateOffset(1);
    const res = await submitLeave(employeeId, input(notice5Id, tomorrow));
    expect(res.ok).toBe(false);
    const count = await db.leaveRequest.count({ where: { employeeId } });
    expect(count).toBe(0);
  });

  // ── noticePeriodDays: -3 (backdating allowed up to 3 days) ────────────────

  it("noticePeriodDays=-3: allows a start 2 days in the past", async () => {
    const twoDaysAgo = dateOffset(-2);
    const res = await previewLeave(employeeId, input(past3Id, twoDaysAgo));
    // Notice check should NOT fire; other errors (non-working day) are irrelevant here.
    expect(res.errors.some((e) => /past|notice/i.test(e))).toBe(false);
  });

  it("noticePeriodDays=-3: blocks a start 5 days in the past", async () => {
    const fiveDaysAgo = dateOffset(-5);
    const res = await previewLeave(employeeId, input(past3Id, fiveDaysAgo));
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/3 day.*past|past.*3 day/i);
  });

  // ── noticePeriodDays: 0 (no restriction) ──────────────────────────────────

  it("noticePeriodDays=0: today's date is not blocked by notice rule", async () => {
    const today = dubaiToday();
    const res = await previewLeave(employeeId, input(zeroId, today));
    // Notice rule should not fire — other errors (weekend) are fine.
    expect(res.errors.some((e) => /notice|day.*notice/i.test(e))).toBe(false);
  });
});
