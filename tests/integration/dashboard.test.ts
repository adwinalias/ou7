// Integration tests for the dashboard reads (Epic 8) against a real Postgres: the
// allowance balance matches the engine, and the next-7-days strip reflects region
// weekends + the employee's work pattern + their leave, without leaking notes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDashboard } from "@/lib/dashboard";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[dashboard.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "dash-it-";
const DEDUCT = "DASHV";
const NONDEDUCT = "DASHO";
const SECRET = "DASH-SECRET-NOTE";

let employeeId = "";
let workPatternId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const windowToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

suite("Dashboard reads (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [DEDUCT, NONDEDUCT] } } });

    const deduct = await db.leaveType.create({ data: { name: "Dash Vacation", code: DEDUCT, color: "#2F6FEB", deductsAllowance: true } });
    const nonDeduct = await db.leaveType.create({ data: { name: "Dash OOO", code: NONDEDUCT, color: "#B58900", deductsAllowance: false } });

    // Work pattern: Wednesday off (plus the region's Sat/Sun weekend).
    workPatternId = (
      await db.workPattern.create({ data: { mon: true, tue: true, wed: false, thu: true, fri: true, sat: false, sun: false } })
    ).id;
    employeeId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}staff@interestingtimes.me`,
          firstName: "Dash",
          lastName: "Board",
          regionId: uae.id,
          joiningDate: day("2024-01-01"),
          role: "STAFF",
          workPatternId,
        },
      })
    ).id;

    const period = await db.allowancePeriod.create({
      data: { employeeId, regionId: uae.id, startDate: day("2026-01-01"), opening: 10 },
    });

    // Balance inputs (past dates, in-period): taken 2, pending 3.
    await db.leaveRequest.create({
      data: { employeeId, leaveTypeId: deduct.id, startDate: day("2026-02-02"), endDate: day("2026-02-03"), durationMode: "MULTI", workingDays: 2, allowanceDays: 2, status: "APPROVED", allowancePeriodId: period.id, createdById: employeeId },
    });
    await db.leaveRequest.create({
      data: { employeeId, leaveTypeId: deduct.id, startDate: day("2026-02-09"), endDate: day("2026-02-11"), durationMode: "MULTI", workingDays: 3, allowanceDays: 3, status: "PENDING", allowancePeriodId: period.id, createdById: employeeId },
    });

    // A non-deducting approved leave spanning the whole next-7 window → shows on the strip
    // without affecting the allowance. Carries a private note (must not leak).
    await db.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: nonDeduct.id,
        startDate: day(windowToday),
        endDate: day(addDaysISO(windowToday, 6)),
        durationMode: "MULTI",
        workingDays: 5,
        allowanceDays: 0,
        status: "APPROVED",
        notes: SECRET,
        createdById: employeeId,
      },
    });
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    if (workPatternId) await db.workPattern.deleteMany({ where: { id: workPatternId } });
    await db.leaveType.deleteMany({ where: { code: { in: [DEDUCT, NONDEDUCT] } } });
    await db.$disconnect();
  });

  it("balance matches the engine (taken/pending/remaining/available)", async () => {
    const { balance } = await getDashboard(employeeId);
    expect(balance).toMatchObject({ opening: 10, takenApproved: 2, pending: 3, remaining: 8, available: 5 });
  });

  it("next-7 strip starts today and spans 7 days", async () => {
    const { days } = await getDashboard(employeeId);
    expect(days).toHaveLength(7);
    expect(days[0]!.iso).toBe(windowToday);
    expect(days[0]!.today).toBe(true);
  });

  it("marks region weekends and the work-pattern day off as non-working", async () => {
    const { days } = await getDashboard(employeeId);
    for (const cell of days) {
      const weekday = new Date(`${cell.iso}T00:00:00.000Z`).getUTCDay();
      if (weekday === 0 || weekday === 6 || weekday === 3) expect(cell.kind).toBe("off"); // Sun/Sat or Wed
    }
  });

  it("shows the spanning leave on at least one working day", async () => {
    const { days } = await getDashboard(employeeId);
    expect(days.some((c) => c.kind === "approved" && c.code === NONDEDUCT)).toBe(true);
  });

  it("never leaks notes", async () => {
    expect(JSON.stringify(await getDashboard(employeeId))).not.toContain(SECRET);
  });
});
