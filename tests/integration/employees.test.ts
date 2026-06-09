// Integration tests for employee management (Epic 9.1): create/deactivate (audited),
// engine-derived allowance profile from the entitlement policy (+ STOP when no policy),
// and bulk import. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { proRataOpening } from "@/core/allowance";
import { upsertEntitlementPolicy } from "@/lib/config";
import {
  bulkImportEmployees,
  createEmployee,
  deactivateEmployee,
  generateAllowanceProfile,
} from "@/lib/employees";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[employees.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "emp-it-";
const REGION = "emp-it-region";
let regionId = "";
let actorId = "";

const baseInput = (email: string, over: Partial<Parameters<typeof createEmployee>[1]> = {}) => ({
  email,
  firstName: "Test",
  lastName: "Person",
  regionId,
  joiningISO: "2026-01-01",
  role: "STAFF" as const,
  approverLevel: "NONE" as const,
  employmentType: "FULL_TIME" as const,
  ...over,
});

suite("Employee management (integration)", () => {
  beforeAll(async () => {
    const region = await db.region.upsert({ where: { name: REGION }, update: {}, create: { name: REGION, weekendDays: [6, 0] } });
    regionId = region.id;
    await db.auditEvent.deleteMany({ where: { actor: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.entitlementPolicy.deleteMany({ where: { regionId } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    actorId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "Emp", lastName: "HR", regionId, joiningDate: new Date("2024-01-01T00:00:00.000Z"), role: "HR" } })).id;
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.entitlementPolicy.deleteMany({ where: { regionId } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.region.deleteMany({ where: { name: REGION } });
    await db.$disconnect();
  });

  it("creates an employee (audited)", async () => {
    const id = await createEmployee(actorId, baseInput(`${PREFIX}a@interestingtimes.me`));
    expect(await db.employee.findUnique({ where: { id } })).toBeTruthy();
    expect(await db.auditEvent.findFirst({ where: { action: "EMPLOYEE_CREATE", entityId: id } })).toBeTruthy();
  });

  it("STOPS profile generation when no policy is configured (no invented number)", async () => {
    const id = await createEmployee(actorId, baseInput(`${PREFIX}b@interestingtimes.me`, { role: "APPROVER" }));
    const res = await generateAllowanceProfile(actorId, id, 2026);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no entitlement policy/i);
    expect(await db.allowancePeriod.findFirst({ where: { employeeId: id } })).toBeNull();
  });

  it("generates opening via the engine from the policy + joining date (pro-rata)", async () => {
    await upsertEntitlementPolicy(actorId, { regionId, role: "STAFF", annualDays: 24, carryOverCapDays: null, carryOverExpiry: null });
    const id = await createEmployee(actorId, baseInput(`${PREFIX}c@interestingtimes.me`, { joiningISO: "2026-07-01" }));

    const res = await generateAllowanceProfile(actorId, id, 2026);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const expected = proRataOpening(24, "2026-07-01", "2026-01-01", "2026-12-31");
    expect(res.opening).toBe(expected);
    const period = await db.allowancePeriod.findFirstOrThrow({ where: { employeeId: id } });
    expect(period.opening).toBe(expected);
    expect(await db.auditEvent.findFirst({ where: { action: "ALLOWANCE_PROFILE_GENERATE", entityId: period.id } })).toBeTruthy();

    // Second attempt is refused (already has an open period).
    expect((await generateAllowanceProfile(actorId, id, 2026)).ok).toBe(false);
  });

  it("deactivates an employee (audited)", async () => {
    const id = await createEmployee(actorId, baseInput(`${PREFIX}d@interestingtimes.me`));
    await deactivateEmployee(actorId, id);
    expect((await db.employee.findUniqueOrThrow({ where: { id } })).status).toBe("INACTIVE");
    expect(await db.auditEvent.findFirst({ where: { action: "EMPLOYEE_DEACTIVATE", entityId: id } })).toBeTruthy();
  });

  it("bulk imports valid rows and reports invalid ones", async () => {
    const csv = [
      `${PREFIX}import1@interestingtimes.me,Ima,Port,${REGION},2026-02-01`,
      `${PREFIX}bad@interestingtimes.me,No,Region,NopeLand,2026-02-01`,
    ].join("\n");
    const summary = await bulkImportEmployees(actorId, csv);
    expect(summary.created).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]!.message).toMatch(/unknown region/i);
    expect(await db.employee.findUnique({ where: { email: `${PREFIX}import1@interestingtimes.me` } })).toBeTruthy();
  });
});
