// Epic 31.1 — "Set remaining to X" helper.
// Verifies: positive/negative/zero delta, empty reason rejected, ledger row written (not a
// raw balance column write), audit trail present. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { previewSetRemaining, setRemaining } from "@/lib/allowance-admin";
import { getOpenPeriodBalance } from "@/lib/allowance";
import { computeRemaining } from "@/core/allowance";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[set-remaining.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "sr-it-";
let uaeId = "";
let empId = "";
let actorId = "";
let periodId = "";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Current remaining for a period with no leave requests (all taken = 0).
const remainingOf = async (pid: string) => {
  const p = await db.allowancePeriod.findUniqueOrThrow({ where: { id: pid } });
  return computeRemaining({ opening: p.opening, carryOver: p.carryOver, adjustments: p.adjustments, deductions: p.deductions, takenApproved: 0 });
};

suite("setRemaining (Epic 31.1)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    uaeId = uae.id;

    await db.allowanceAdjustment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });

    actorId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "SR", lastName: "HR", regionId: uaeId, joiningDate: day("2024-01-01"), role: "HR" } })).id;
    empId = (await db.employee.create({ data: { email: `${PREFIX}emp@interestingtimes.me`, firstName: "SR", lastName: "Emp", regionId: uaeId, joiningDate: day("2026-01-01"), role: "STAFF" } })).id;
    // opening=20, no carry-over, no adjustments → remaining=20
    periodId = (await db.allowancePeriod.create({ data: { employeeId: empId, regionId: uaeId, startDate: day("2027-01-01"), opening: 20 } })).id;
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.allowanceAdjustment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
  });

  it("previewSetRemaining returns currentRemaining, target, and impliedDelta", async () => {
    const preview = await previewSetRemaining(periodId, 25);
    expect("ok" in preview && !preview.ok).toBe(false);
    const p = preview as import("@/lib/allowance-admin").SetRemainingPreview;
    expect(p.currentRemaining).toBe(20);
    expect(p.target).toBe(25);
    expect(p.impliedDelta).toBe(5);
  });

  it("previewSetRemaining rejects non-finite target", async () => {
    const res = await previewSetRemaining(periodId, NaN);
    expect((res as { ok: false; error: string }).ok).toBe(false);
  });

  it("target > current — positive ADJUSTMENT written; recomputed remaining == target", async () => {
    const before = await remainingOf(periodId);
    expect(before).toBe(20);

    const res = await setRemaining(actorId, periodId, 23, "goodwill grant");
    expect(res.ok).toBe(true);

    // Recomputed remaining must equal target.
    const after = await remainingOf(periodId);
    expect(after).toBe(23);

    // A ledger row was written with the correct delta.
    const row = await db.allowanceAdjustment.findFirst({ where: { periodId, reason: "goodwill grant" }, orderBy: { createdAt: "desc" } });
    expect(row).toBeTruthy();
    expect(row?.delta).toBe(3);
    expect(row?.bucket).toBe("VACATION");
    expect(row?.kind).toBe("ADJUSTMENT");

    // The AllowancePeriod column is the ledger sum, not a directly set value (projection check).
    const period = await db.allowancePeriod.findUniqueOrThrow({ where: { id: periodId } });
    expect(period.adjustments).toBe(3); // sum of all VACATION ADJUSTMENTs on this period so far

    // Audited.
    expect(await db.auditEvent.findFirst({ where: { action: "ADJUSTMENT_ADD", entityId: periodId } })).toBeTruthy();
  });

  it("target < current — negative ADJUSTMENT written; remaining == target", async () => {
    // After previous test remaining is 23; set to 18 → delta = −5.
    const res = await setRemaining(actorId, periodId, 18, "payroll correction");
    expect(res.ok).toBe(true);

    const after = await remainingOf(periodId);
    expect(after).toBe(18);

    const row = await db.allowanceAdjustment.findFirst({ where: { periodId, reason: "payroll correction" }, orderBy: { createdAt: "desc" } });
    expect(row?.delta).toBe(-5);
    expect(row?.bucket).toBe("VACATION");
  });

  it("target == current — no ledger row written (no-op)", async () => {
    // After previous tests remaining is 18.
    const before = await db.allowanceAdjustment.count({ where: { periodId } });
    const res = await setRemaining(actorId, periodId, 18, "already correct");
    expect(res.ok).toBe(true);
    expect((res as { ok: true; noOp?: boolean }).noOp).toBe(true);
    const after = await db.allowanceAdjustment.count({ where: { periodId } });
    expect(after).toBe(before); // no new row
  });

  it("empty reason is rejected, no write", async () => {
    const before = await db.allowanceAdjustment.count({ where: { periodId } });
    const res = await setRemaining(actorId, periodId, 15, "   ");
    expect(res.ok).toBe(false);
    expect(await db.allowanceAdjustment.count({ where: { periodId } })).toBe(before);
  });

  it("engine-derived remaining (via getOpenPeriodBalance) equals target after setRemaining", async () => {
    // Wire the full lib/allowance read path to confirm end-to-end consistency.
    // Create a fresh isolated period for clarity.
    const freshPeriodId = (await db.allowancePeriod.create({ data: { employeeId: empId, regionId: uaeId, startDate: day("2028-01-01"), opening: 15 } })).id;
    const res = await setRemaining(actorId, freshPeriodId, 12, "end-to-end check");
    expect(res.ok).toBe(true);

    const bal = await getOpenPeriodBalance(empId);
    // getOpenPeriodBalance returns the OPEN period — 2028 is the newer open one.
    expect(bal).not.toBeNull();
    if (bal) expect(bal.remaining).toBe(12);

    // Clean up the extra period.
    await db.allowanceAdjustment.deleteMany({ where: { periodId: freshPeriodId } });
    await db.allowancePeriod.delete({ where: { id: freshPeriodId } });
  });
});
