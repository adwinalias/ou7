// Integration tests for add-leave-on-behalf (Epic 9.3): permission gate, audited PENDING
// create with the actor as creator, and that the normal validation still applies.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLeaveOnBehalf } from "@/lib/leave";
import { AuthError } from "@/lib/rbac";
import { db } from "@/lib/db";
import type { Actor } from "@/core/types";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[add-on-behalf.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "ob-it-";
const TYPE = "OBV";
let targetId = "";
let hrId = "";
let typeId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const actor = (over: Partial<Actor> & Pick<Actor, "employeeId" | "role">): Actor => ({ approverLevel: "NONE", status: "ACTIVE", approverForIds: [], ...over });

suite("Add leave on behalf (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    typeId = (await db.leaveType.create({ data: { name: "OB Vacation", code: TYPE, color: "#2F6FEB", deductsAllowance: true } })).id;
    targetId = (await db.employee.create({ data: { email: `${PREFIX}target@interestingtimes.me`, firstName: "Tara", lastName: "Get", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    hrId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "On", lastName: "Behalf", regionId: uae.id, joiningDate: day("2024-01-01"), role: "HR", approverLevel: "APPROVER_ADD_EDIT" } })).id;
    await db.allowancePeriod.create({ data: { employeeId: targetId, regionId: uae.id, startDate: day("2026-01-01"), opening: 5 } });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: hrId } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    await db.$disconnect();
  });

  it("HR adds a PENDING request for the target, created-by the actor, audited", async () => {
    const res = await addLeaveOnBehalf(actor({ employeeId: hrId, role: "HR", approverLevel: "APPROVER_ADD_EDIT" }), targetId, { leaveTypeId: typeId, mode: "DAY", startDate: "2026-03-02" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = await db.leaveRequest.findUniqueOrThrow({ where: { id: res.id } });
    expect(row.status).toBe("PENDING");
    expect(row.employeeId).toBe(targetId);
    expect(row.createdById).toBe(hrId);
    expect(await db.auditEvent.findFirst({ where: { action: "LEAVE_CREATE_ON_BEHALF", entityId: res.id } })).toBeTruthy();
  });

  it("rejects actors without the +Add permission (403)", async () => {
    for (const bad of [actor({ employeeId: hrId, role: "STAFF" }), actor({ employeeId: hrId, role: "APPROVER", approverLevel: "APPROVER" })]) {
      await expect(addLeaveOnBehalf(bad, targetId, { leaveTypeId: typeId, mode: "DAY", startDate: "2026-03-09" })).rejects.toBeInstanceOf(AuthError);
    }
  });

  it("still enforces validation (over-booking blocked)", async () => {
    const res = await addLeaveOnBehalf(actor({ employeeId: hrId, role: "HR", approverLevel: "APPROVER_ADD_EDIT" }), targetId, { leaveTypeId: typeId, mode: "MULTI", startDate: "2026-04-06", endDate: "2026-04-17" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/available balance/i);
  });
});
