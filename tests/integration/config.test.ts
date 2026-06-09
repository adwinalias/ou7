// Integration tests for the config hub (Epic 9.5): entitlement policy upsert/get/delete,
// leave-type/department/tag creation, leave-type retire — all audited. Self-skips w/o DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDepartment,
  createLeaveType,
  createTag,
  deleteEntitlementPolicy,
  getEntitlementPolicy,
  listEntitlementPolicies,
  setLeaveTypeActive,
  upsertEntitlementPolicy,
} from "@/lib/config";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[config.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "cfg-it-";
const REGION = "cfg-it-region";
const LT_CODE = "CFGX";
let regionId = "";
let actorId = "";

suite("Config hub (integration)", () => {
  beforeAll(async () => {
    const region = await db.region.upsert({ where: { name: REGION }, update: {}, create: { name: REGION, weekendDays: [6, 0] } });
    regionId = region.id;
    await db.entitlementPolicy.deleteMany({ where: { regionId } });
    await db.department.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await db.tag.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: LT_CODE } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    actorId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "Cfg", lastName: "HR", regionId, joiningDate: new Date("2024-01-01T00:00:00.000Z"), role: "HR" } })).id;
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.entitlementPolicy.deleteMany({ where: { regionId } });
    await db.department.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await db.tag.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: LT_CODE } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.region.deleteMany({ where: { name: REGION } });
    await db.$disconnect();
  });

  it("upserts an entitlement policy (create → update), readable + audited", async () => {
    await upsertEntitlementPolicy(actorId, { regionId, role: "STAFF", annualDays: 26, carryOverCapDays: 5, carryOverExpiry: "03-31" });
    let p = await getEntitlementPolicy(regionId, "STAFF");
    expect(p?.annualDays).toBe(26);
    expect(p?.carryOverCapDays).toBe(5);
    expect(await db.auditEvent.findFirst({ where: { action: "POLICY_CREATE", actorId } })).toBeTruthy();

    await upsertEntitlementPolicy(actorId, { regionId, role: "STAFF", annualDays: 28, carryOverCapDays: null, carryOverExpiry: null });
    p = await getEntitlementPolicy(regionId, "STAFF");
    expect(p?.annualDays).toBe(28);
    expect(p?.carryOverCapDays).toBeNull();
    expect(await db.auditEvent.findFirst({ where: { action: "POLICY_UPDATE", actorId } })).toBeTruthy();

    expect((await listEntitlementPolicies()).some((x) => x.regionId === regionId && x.role === "STAFF")).toBe(true);
  });

  it("returns null when no policy is configured (so provisioning can stop)", async () => {
    expect(await getEntitlementPolicy(regionId, "APPROVER")).toBeNull();
  });

  it("deletes a policy (audited)", async () => {
    const id = await upsertEntitlementPolicy(actorId, { regionId, role: "HR", annualDays: 30, carryOverCapDays: null, carryOverExpiry: null });
    await deleteEntitlementPolicy(actorId, id);
    expect(await getEntitlementPolicy(regionId, "HR")).toBeNull();
    expect(await db.auditEvent.findFirst({ where: { action: "POLICY_DELETE", entityId: id } })).toBeTruthy();
  });

  it("creates departments, tags and leave types; retires a leave type (audited)", async () => {
    await createDepartment(actorId, `${PREFIX}Ops`);
    await createTag(actorId, `${PREFIX}remote`);
    const ltId = await createLeaveType(actorId, { name: `${PREFIX}Study`, code: LT_CODE, color: "#6B5BD2", deductsAllowance: true, paid: true, noteRequired: false });
    expect(await db.department.findFirst({ where: { name: `${PREFIX}Ops` } })).toBeTruthy();
    expect(await db.auditEvent.findFirst({ where: { action: "LEAVE_TYPE_CREATE", entityId: ltId } })).toBeTruthy();

    await setLeaveTypeActive(actorId, ltId, false);
    expect((await db.leaveType.findUniqueOrThrow({ where: { id: ltId } })).active).toBe(false);
    expect(await db.auditEvent.findFirst({ where: { action: "LEAVE_TYPE_RETIRE", entityId: ltId } })).toBeTruthy();
  });
});
