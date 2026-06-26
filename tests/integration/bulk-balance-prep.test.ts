// Epic 31.2 — Bulk balance prep (integration). Seeds a department with employees in varied
// states, including the open-period invariant (bug fix: employees with an open period must
// never get a second one). Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyBulkBalancePrep, previewBulkBalancePrep } from "@/lib/allowance-admin";
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
if (!dbUp) console.warn("[bulk-balance-prep.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "bbp-it-";
const TARGET_YEAR = 2027;
const PRIOR_YEAR = 2026;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let regionId = "";
let deptId = "";
let actorId = "";

// Employee roster:
//   empA — closed prior-year period (opening=20), no target-year period
//   empB — closed prior-year period (opening=25), no target-year period
//   empC — no periods at all (COPY_PREVIOUS → skipped; FIXED → eligible)
//   empD — already has a target-year period (opening=99; endDate:null → open) → alreadyHave
//   empE — has an OPEN current-year period (endDate:null) and no target-year period
//           → must be SKIPPED to preserve one-open-period invariant
let empAId = "";
let empBId = "";
let empCId = "";
let empDId = "";
let empDPeriodId = "";
let empEId = "";
let empECurrentPeriodId = "";

suite("Bulk balance prep (Epic 31.2)", () => {
  beforeAll(async () => {
    const region = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    regionId = region.id;

    const dept = await db.department.upsert({ where: { name: "BBP Test Dept" }, update: {}, create: { name: "BBP Test Dept" } });
    deptId = dept.id;

    // Wipe leftovers from a prior failed run.
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });

    actorId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "BBP", lastName: "HR", regionId, joiningDate: day("2024-01-01"), role: "HR", departmentId: deptId } })).id;
    empAId = (await db.employee.create({ data: { email: `${PREFIX}empA@interestingtimes.me`, firstName: "Emp", lastName: "A", regionId, joiningDate: day("2025-01-01"), role: "STAFF", departmentId: deptId } })).id;
    empBId = (await db.employee.create({ data: { email: `${PREFIX}empB@interestingtimes.me`, firstName: "Emp", lastName: "B", regionId, joiningDate: day("2025-01-01"), role: "STAFF", departmentId: deptId } })).id;
    empCId = (await db.employee.create({ data: { email: `${PREFIX}empC@interestingtimes.me`, firstName: "Emp", lastName: "C", regionId, joiningDate: day("2025-01-01"), role: "STAFF", departmentId: deptId } })).id;
    empDId = (await db.employee.create({ data: { email: `${PREFIX}empD@interestingtimes.me`, firstName: "Emp", lastName: "D", regionId, joiningDate: day("2025-01-01"), role: "STAFF", departmentId: deptId } })).id;
    empEId = (await db.employee.create({ data: { email: `${PREFIX}empE@interestingtimes.me`, firstName: "Emp", lastName: "E", regionId, joiningDate: day("2025-01-01"), role: "STAFF", departmentId: deptId } })).id;

    // A + B: closed prior-year periods (realistic post-rollover state).
    await db.allowancePeriod.create({ data: { employeeId: empAId, regionId, startDate: day(`${PRIOR_YEAR}-01-01`), endDate: day(`${PRIOR_YEAR}-12-31`), opening: 20 } });
    await db.allowancePeriod.create({ data: { employeeId: empBId, regionId, startDate: day(`${PRIOR_YEAR}-01-01`), endDate: day(`${PRIOR_YEAR}-12-31`), opening: 25 } });

    // D: already has a target-year OPEN period.
    const dp = await db.allowancePeriod.create({ data: { employeeId: empDId, regionId, startDate: day(`${TARGET_YEAR}-01-01`), opening: 99 } });
    empDPeriodId = dp.id;

    // E: has an OPEN CURRENT-year period (endDate:null) — no target-year period.
    // This is the "needs rollover first" case.
    const ep = await db.allowancePeriod.create({ data: { employeeId: empEId, regionId, startDate: day(`${PRIOR_YEAR}-01-01`), opening: 22 } });
    empECurrentPeriodId = ep.id;
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.department.deleteMany({ where: { name: "BBP Test Dept" } });
    await db.$disconnect();
  });

  // ── preview (FIXED 25) ───────────────────────────────────────────────────
  it("FIXED preview: A+B+C eligible; D in alreadyHave; E skipped (open period)", async () => {
    const result = await previewBulkBalancePrep(deptId, TARGET_YEAR, { mode: "FIXED", value: 25 });

    expect(result.alreadyHave).toBe(1); // only D has target-year period
    const eligibleIds = result.eligible.map((e) => e.employeeId);
    expect(eligibleIds).toContain(empAId);
    expect(eligibleIds).toContain(empBId);
    expect(eligibleIds).toContain(empCId);
    expect(eligibleIds).not.toContain(empDId); // already has target-year
    expect(eligibleIds).not.toContain(empEId); // has open period → skipped

    for (const e of result.eligible) {
      expect(e.proposedOpening).toBe(25);
    }

    // E skipped with open-period reason.
    const eSkip = result.skipped.find((s) => s.employeeId === empEId);
    expect(eSkip).toBeTruthy();
    expect(eSkip?.reason).toMatch(/open period/i);
  });

  // ── preview (COPY_PREVIOUS) ───────────────────────────────────────────────
  it("COPY_PREVIOUS preview: A→20, B→25; C skipped (no prior); D in alreadyHave; E skipped (open period)", async () => {
    const result = await previewBulkBalancePrep(deptId, TARGET_YEAR, { mode: "COPY_PREVIOUS" });

    expect(result.alreadyHave).toBe(1); // D

    const a = result.eligible.find((e) => e.employeeId === empAId);
    const b = result.eligible.find((e) => e.employeeId === empBId);
    expect(a?.proposedOpening).toBe(20);
    expect(b?.proposedOpening).toBe(25);

    // C: no prior-year period → skipped.
    const cSkip = result.skipped.find((s) => s.employeeId === empCId);
    expect(cSkip).toBeTruthy();
    expect(cSkip?.reason).toMatch(/no prior-year period/i);

    // E: open period → skipped (takes priority over prior-year check).
    const eSkip = result.skipped.find((s) => s.employeeId === empEId);
    expect(eSkip).toBeTruthy();
    expect(eSkip?.reason).toMatch(/open period/i);

    // D not in skipped (it's in alreadyHave).
    expect(result.skipped.find((s) => s.employeeId === empDId)).toBeUndefined();
  });

  // ── apply (FIXED) — open-period invariant ────────────────────────────────
  it("apply FIXED 30: skips E (open period), creates A+B+C (and HR), D untouched, audited", async () => {
    const before = await db.allowancePeriod.count({
      where: { employee: { email: { startsWith: PREFIX } }, startDate: { gte: day(`${TARGET_YEAR}-01-01`), lte: day(`${TARGET_YEAR}-12-31`) } },
    });
    expect(before).toBe(1); // only D

    const res = await applyBulkBalancePrep(actorId, deptId, TARGET_YEAR, { mode: "FIXED", value: 30 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // E is skipped; C+A+B+HR actor are created.
    expect(res.skipped).toBeGreaterThanOrEqual(1); // at least E
    expect(res.created).toBeGreaterThanOrEqual(3); // at minimum A, B, C

    // D untouched.
    const dPeriod = await db.allowancePeriod.findUniqueOrThrow({ where: { id: empDPeriodId } });
    expect(dPeriod.opening).toBe(99);

    // A, B, C got opening=30.
    for (const empId of [empAId, empBId, empCId]) {
      const p = await db.allowancePeriod.findFirst({
        where: { employeeId: empId, startDate: { gte: day(`${TARGET_YEAR}-01-01`), lte: day(`${TARGET_YEAR}-12-31`) } },
      });
      expect(p).toBeTruthy();
      expect(p?.opening).toBe(30);
    }

    // E: NO second open period created — still has exactly one open period.
    const eOpenPeriods = await db.allowancePeriod.findMany({ where: { employeeId: empEId, endDate: null } });
    expect(eOpenPeriods).toHaveLength(1);
    expect(eOpenPeriods[0]?.id).toBe(empECurrentPeriodId); // original period unchanged

    // E's balance is uncorrupted — getOpenPeriodBalance still returns the current-year period.
    const eBal = await getOpenPeriodBalance(empEId);
    expect(eBal).not.toBeNull();
    expect(eBal?.opening).toBe(22); // the original opening, unchanged

    // Audited.
    expect(await db.auditEvent.findFirst({ where: { action: "BULK_BALANCE_PREP", actorId } })).toBeTruthy();
  });

  // ── idempotent re-run ──────────────────────────────────────────────────────
  it("re-running apply creates 0 new periods (idempotent)", async () => {
    const countBefore = await db.allowancePeriod.count({
      where: { employee: { email: { startsWith: PREFIX } }, startDate: { gte: day(`${TARGET_YEAR}-01-01`), lte: day(`${TARGET_YEAR}-12-31`) } },
    });

    const res = await applyBulkBalancePrep(actorId, deptId, TARGET_YEAR, { mode: "FIXED", value: 30 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.created).toBe(0);

    const countAfter = await db.allowancePeriod.count({
      where: { employee: { email: { startsWith: PREFIX } }, startDate: { gte: day(`${TARGET_YEAR}-01-01`), lte: day(`${TARGET_YEAR}-12-31`) } },
    });
    expect(countAfter).toBe(countBefore);
  });
});
