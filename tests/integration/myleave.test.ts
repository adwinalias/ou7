// Integration tests for My-Leave reads (Epic 7.1/7.3) against a real Postgres: history is
// scoped to the signed-in employee, filters work, pagination works, and the per-year
// allowance panel matches the engine. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAllPeriodBalances } from "@/lib/allowance";
import { getLeaveHistory } from "@/lib/myleave";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[myleave.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "ml-it-";
const MLV = "MLV";
const MLS = "MLS";

let aId = "";
let bId = "";
let cId = "";
let p2026 = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

suite("My-Leave reads (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [MLV, MLS] } } });

    const mlv = await db.leaveType.create({ data: { name: "ML Vacation", code: MLV, color: "#2F6FEB", deductsAllowance: true } });
    const mls = await db.leaveType.create({ data: { name: "ML Sick", code: MLS, color: "#E8833A", deductsAllowance: false } });

    const mk = (key: string) =>
      db.employee.create({
        data: { email: `${PREFIX}${key}@interestingtimes.me`, firstName: key, lastName: "ML", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" },
      });
    aId = (await mk("a")).id;
    bId = (await mk("b")).id;
    cId = (await mk("c")).id;

    // A: two periods (current 2026 + closed 2025).
    p2026 = (await db.allowancePeriod.create({ data: { employeeId: aId, regionId: uae.id, startDate: day("2026-01-01"), opening: 20 } })).id;
    await db.allowancePeriod.create({
      data: { employeeId: aId, regionId: uae.id, startDate: day("2025-01-01"), endDate: day("2025-12-31"), opening: 15 },
    });

    // A's leave: approved (taken 3), declined (ignored), pending (2).
    await db.leaveRequest.create({ data: { employeeId: aId, leaveTypeId: mlv.id, startDate: day("2026-03-02"), endDate: day("2026-03-02"), durationMode: "DAY", workingDays: 3, allowanceDays: 3, status: "APPROVED", allowancePeriodId: p2026, createdById: aId } });
    await db.leaveRequest.create({ data: { employeeId: aId, leaveTypeId: mls.id, startDate: day("2026-04-06"), endDate: day("2026-04-06"), durationMode: "DAY", workingDays: 1, allowanceDays: 0, status: "DECLINED", createdById: aId } });
    await db.leaveRequest.create({ data: { employeeId: aId, leaveTypeId: mlv.id, startDate: day("2026-05-04"), endDate: day("2026-05-04"), durationMode: "DAY", workingDays: 2, allowanceDays: 2, status: "PENDING", allowancePeriodId: p2026, createdById: aId } });

    // B: one leave (must never appear in A's history).
    await db.leaveRequest.create({ data: { employeeId: bId, leaveTypeId: mlv.id, startDate: day("2026-03-02"), endDate: day("2026-03-02"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "APPROVED", createdById: bId } });

    // C: 21 rows for pagination.
    for (let i = 0; i < 21; i++) {
      const d = day(`2026-01-01`);
      d.setUTCDate(d.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      await db.leaveRequest.create({ data: { employeeId: cId, leaveTypeId: mlv.id, startDate: day(iso), endDate: day(iso), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status: "APPROVED", createdById: cId } });
    }
  });

  afterAll(async () => {
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [MLV, MLS] } } });
    await db.$disconnect();
  });

  it("scopes history to the signed-in employee only", async () => {
    const res = await getLeaveHistory(aId, {});
    expect(res.total).toBe(3);
    // Every row belongs to A — B's leave (same date/type) must not leak in.
    const bRow = await db.leaveRequest.findFirstOrThrow({ where: { employeeId: bId } });
    expect(res.rows.some((r) => r.id === bRow.id)).toBe(false);
  });

  it("filters by decision, type, and date range", async () => {
    expect((await getLeaveHistory(aId, { decision: "APPROVED" })).total).toBe(1);
    expect((await getLeaveHistory(aId, { type: MLV })).total).toBe(2);
    expect((await getLeaveHistory(aId, { from: "2026-04-01" })).total).toBe(2); // excludes the March row
    expect((await getLeaveHistory(aId, { to: "2026-03-31" })).total).toBe(1); // only the March row
  });

  it("totals reflect the whole filtered set", async () => {
    const all = await getLeaveHistory(aId, {});
    expect(all.totals.workingDays).toBe(6); // 3 + 1 + 2
    expect(all.totals.allowanceDays).toBe(5); // 3 + 0 + 2
  });

  it("paginates at 20 rows per page", async () => {
    const page1 = await getLeaveHistory(cId, {});
    expect(page1.total).toBe(21);
    expect(page1.rows).toHaveLength(20);
    expect(page1.pageCount).toBe(2);
    const page2 = await getLeaveHistory(cId, { page: 2 });
    expect(page2.rows).toHaveLength(1);
    expect(page2.page).toBe(2);
  });

  it("allowance panel matches the engine across periods (7.3)", async () => {
    const periods = await getAllPeriodBalances(aId);
    expect(periods.map((p) => p.year)).toEqual([2026, 2025]); // newest first
    const y2026 = periods.find((p) => p.year === 2026)!;
    expect(y2026).toMatchObject({ opening: 20, takenApproved: 3, pending: 2, remaining: 17, available: 15, endISO: null });
    const y2025 = periods.find((p) => p.year === 2025)!;
    expect(y2025).toMatchObject({ opening: 15, remaining: 15, available: 15 });
  });
});
