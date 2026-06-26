// Integration test for story 31.3 — getAllowanceLog.
// Seeds an employee with ledger entries across two periods/years; asserts newest-first,
// correct year derivation, and cross-period span. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLedgerEntry, getAllowanceLog } from "@/lib/allowance-admin";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[allowance-log.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "al31-";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let uaeId = "";
let hrId = "";
let empId = "";
let period2025Id = "";
let period2026Id = "";

suite("getAllowanceLog (Epic 31.3)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: { weekendDays: [6, 0] },
      create: { name: "UAE", weekendDays: [6, 0] },
    });
    uaeId = uae.id;

    // Clean up any prior run.
    const emails = [`${PREFIX}hr@it.me`, `${PREFIX}emp@it.me`];
    const existing = await db.employee.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const existingIds = existing.map((e) => e.id);
    if (existingIds.length) {
      await db.allowanceAdjustment.deleteMany({ where: { employeeId: { in: existingIds } } });
      await db.allowancePeriod.deleteMany({ where: { employeeId: { in: existingIds } } });
      await db.auditEvent.deleteMany({ where: { actorId: { in: existingIds } } });
      await db.employee.deleteMany({ where: { id: { in: existingIds } } });
    }

    hrId = (
      await db.employee.create({
        data: { email: `${PREFIX}hr@it.me`, firstName: "Log", lastName: "HR", regionId: uaeId, joiningDate: day("2024-01-01"), role: "HR" },
      })
    ).id;

    empId = (
      await db.employee.create({
        data: { email: `${PREFIX}emp@it.me`, firstName: "Log", lastName: "Emp", regionId: uaeId, joiningDate: day("2025-01-01"), role: "STAFF" },
      })
    ).id;

    // Two closed/open periods across two calendar years.
    period2025Id = (
      await db.allowancePeriod.create({
        data: { employeeId: empId, regionId: uaeId, startDate: day("2025-01-01"), endDate: day("2025-12-31"), opening: 20 },
      })
    ).id;

    period2026Id = (
      await db.allowancePeriod.create({
        data: { employeeId: empId, regionId: uaeId, startDate: day("2026-01-01"), opening: 21 },
      })
    ).id;

    // Three ledger entries: two on the 2025 period, one on 2026.
    await addLedgerEntry(hrId, period2025Id, { kind: "ADJUSTMENT", bucket: "VACATION", delta: 3, reason: "2025 goodwill" });
    await addLedgerEntry(hrId, period2025Id, { kind: "DEDUCTION", bucket: "VACATION", delta: -1, reason: "2025 deduction" });
    await addLedgerEntry(hrId, period2026Id, { kind: "ADJUSTMENT", bucket: "VACATION", delta: 2, reason: "2026 grant" });
  });

  afterAll(async () => {
    const emails = [`${PREFIX}hr@it.me`, `${PREFIX}emp@it.me`];
    const existing = await db.employee.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const existingIds = existing.map((e) => e.id);
    if (existingIds.length) {
      await db.allowanceAdjustment.deleteMany({ where: { employeeId: { in: existingIds } } });
      await db.allowancePeriod.deleteMany({ where: { employeeId: { in: existingIds } } });
      await db.auditEvent.deleteMany({ where: { actorId: { in: existingIds } } });
      await db.employee.deleteMany({ where: { id: { in: existingIds } } });
    }
    await db.$disconnect();
  });

  it("returns all 3 entries newest-first", async () => {
    const rows = await getAllowanceLog(empId);
    expect(rows).toHaveLength(3);
    // newest-first: 2026 grant first, then 2025 deduction, then 2025 goodwill
    const [r0, r1, r2] = rows;
    expect(r0!.reason).toBe("2026 grant");
    expect(r1!.reason).toBe("2025 deduction");
    expect(r2!.reason).toBe("2025 goodwill");
  });

  it("year derived from period.startDate", async () => {
    const rows = await getAllowanceLog(empId);
    const [r0, r1, r2] = rows;
    expect(r0!.year).toBe(2026);
    expect(r1!.year).toBe(2025);
    expect(r2!.year).toBe(2025);
  });

  it("kind, delta, and reason are correct", async () => {
    const rows = await getAllowanceLog(empId);
    const [grant2026, deduction2025] = rows;
    expect(grant2026!.kind).toBe("ADJUSTMENT");
    expect(grant2026!.delta).toBe(2);
    expect(deduction2025!.kind).toBe("DEDUCTION");
    expect(deduction2025!.delta).toBe(-1);
  });

  it("actorName is the HR employee's full name", async () => {
    const rows = await getAllowanceLog(empId);
    for (const r of rows) {
      expect(r.actorName).toBe("Log HR");
    }
  });

  it("spans both years (no period filter)", async () => {
    const years = new Set((await getAllowanceLog(empId)).map((r) => r.year));
    expect(years.has(2025)).toBe(true);
    expect(years.has(2026)).toBe(true);
  });

  it("returns empty array for an employee with no ledger entries", async () => {
    // A brand-new employee with no periods at all.
    const fresh = await db.employee.create({
      data: { email: `${PREFIX}fresh@it.me`, firstName: "Fresh", lastName: "Emp", regionId: uaeId, joiningDate: day("2026-01-01"), role: "STAFF" },
    });
    const rows = await getAllowanceLog(fresh.id);
    expect(rows).toHaveLength(0);
    await db.employee.delete({ where: { id: fresh.id } });
  });
});
