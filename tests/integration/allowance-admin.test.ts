// Integration tests for allowance management v2 (Epic 9.2 / ADR-0009): the audited ledger +
// derived projection, Reset (opening-only) via the engine, negative-Remaining warning, and
// that the seeded policy yields the confirmed pro-rata opening. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLedgerEntry, listAdjustments, previewReset, resetBalance } from "@/lib/allowance-admin";
import { generateAllowanceProfile } from "@/lib/employees";
import { getOpenPeriodBalance } from "@/lib/allowance";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[allowance-admin.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "aa-it-";
const NOPOL_REGION = "aa-it-nopolicy";
let uaeId = "";
let empId = "";
let periodId = "";
let actorId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

suite("Allowance management v2 (integration)", () => {
  beforeAll(async () => {
    // UAE is seeded with a STAFF entitlement policy (annual 22). Ensure it exists.
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    uaeId = uae.id;
    await db.entitlementPolicy.upsert({ where: { regionId_role: { regionId: uaeId, role: "STAFF" } }, update: { annualDays: 22, carryOverCapDays: 5, carryOverExpiry: "03-31" }, create: { regionId: uaeId, role: "STAFF", annualDays: 22, carryOverCapDays: 5, carryOverExpiry: "03-31" } });

    await db.allowanceAdjustment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });

    empId = (await db.employee.create({ data: { email: `${PREFIX}emp@interestingtimes.me`, firstName: "Adj", lastName: "Subject", regionId: uaeId, joiningDate: day("2026-03-10"), role: "STAFF" } })).id;
    actorId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "Adj", lastName: "HR", regionId: uaeId, joiningDate: day("2024-01-01"), role: "HR" } })).id;
    periodId = (await db.allowancePeriod.create({ data: { employeeId: empId, regionId: uaeId, startDate: day("2026-01-01"), opening: 20 } })).id;
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.allowanceAdjustment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.region.deleteMany({ where: { name: NOPOL_REGION } });
    await db.$disconnect();
  });

  it("adjustments are a ledger; the period column is their sum (audited)", async () => {
    expect((await addLedgerEntry(actorId, periodId, { kind: "ADJUSTMENT", delta: 3, reason: "grant" })).ok).toBe(true);
    expect((await addLedgerEntry(actorId, periodId, { kind: "ADJUSTMENT", delta: -1, reason: "correction" })).ok).toBe(true);
    const period = await db.allowancePeriod.findUniqueOrThrow({ where: { id: periodId } });
    expect(period.adjustments).toBe(2); // 3 + (−1)
    expect((await listAdjustments(periodId)).length).toBe(2);
    expect(await db.auditEvent.findFirst({ where: { action: "ADJUSTMENT_ADD", entityId: periodId } })).toBeTruthy();
  });

  it("deductions are recorded the same way", async () => {
    expect((await addLedgerEntry(actorId, periodId, { kind: "DEDUCTION", delta: 2, reason: "unpaid day" })).ok).toBe(true);
    expect((await db.allowancePeriod.findUniqueOrThrow({ where: { id: periodId } })).deductions).toBe(2);
  });

  it("requires a reason and a non-zero delta", async () => {
    expect((await addLedgerEntry(actorId, periodId, { kind: "ADJUSTMENT", delta: 1, reason: "  " })).ok).toBe(false);
    expect((await addLedgerEntry(actorId, periodId, { kind: "ADJUSTMENT", delta: 0, reason: "x" })).ok).toBe(false);
  });

  it("allows an entry that drives Remaining negative, but warns", async () => {
    const res = await addLedgerEntry(actorId, periodId, { kind: "DEDUCTION", delta: 25, reason: "big clawback" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.warning).toMatch(/negative/i);
  });

  it("previews Reset (opening 20 → engine value 19) without writing", async () => {
    const preview = await previewReset(empId, 2026);
    expect(preview.hasPolicy).toBe(true);
    expect(preview.currentOpening).toBe(20);
    expect(preview.proposedOpening).toBe(19); // ceil(22/12 * 10), March joiner
    expect((await db.allowancePeriod.findUniqueOrThrow({ where: { id: periodId } })).opening).toBe(20); // unchanged
  });

  it("Reset recomputes opening only, preserving adjustments & carry-over (audited)", async () => {
    const res = await resetBalance(actorId, empId, 2026);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.opening).toBe(19);
    const period = await db.allowancePeriod.findUniqueOrThrow({ where: { id: periodId } });
    expect(period.opening).toBe(19);
    expect(period.adjustments).toBe(2); // preserved
    expect(period.carryOver).toBe(0); // untouched
    expect(await db.auditEvent.findFirst({ where: { action: "ALLOWANCE_RESET", entityId: periodId } })).toBeTruthy();
  });

  it("Reset stops when no entitlement policy is configured", async () => {
    const region = await db.region.create({ data: { name: NOPOL_REGION, weekendDays: [6, 0] } });
    const id = (await db.employee.create({ data: { email: `${PREFIX}nopol@interestingtimes.me`, firstName: "No", lastName: "Policy", regionId: region.id, joiningDate: day("2026-03-10"), role: "STAFF" } })).id;
    const res = await resetBalance(actorId, id, 2026);
    expect(res.ok).toBe(false);
  });

  it("seeded policy + engine give the confirmed pro-rata opening (March joiner → 19)", async () => {
    const id = (await db.employee.create({ data: { email: `${PREFIX}march@interestingtimes.me`, firstName: "Marcia", lastName: "March", regionId: uaeId, joiningDate: day("2026-03-10"), role: "STAFF" } })).id;
    const res = await generateAllowanceProfile(actorId, id, 2026);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.opening).toBe(19);
  });
});
