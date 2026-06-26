// Story 27.2 — Archive, not delete, leave types.
// Guards the archive invariants: picker filtering, booking rejection, restore, history intact.
// Self-skips without a DB (matches the project-wide integration test pattern).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLeaveType, setLeaveTypeActive } from "@/lib/config";
import { getRequestContext, previewLeave, submitLeave } from "@/lib/leave";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[leavetype-archive.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "lt-arc-it-";
const LT_CODE = "ARCT";

let regionId = "";
let actorId = "";
let employeeId = "";
let ltId = "";

suite("Leave-type archive invariants (story 27.2)", () => {
  beforeAll(async () => {
    const region = await db.region.upsert({
      where: { name: `${PREFIX}region` },
      update: {},
      create: { name: `${PREFIX}region`, weekendDays: [6, 0] },
    });
    regionId = region.id;

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: LT_CODE } });

    actorId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}hr@interestingtimes.me`,
          firstName: "Arc",
          lastName: "HR",
          regionId,
          joiningDate: new Date("2024-01-01T00:00:00.000Z"),
          role: "HR",
        },
      })
    ).id;

    employeeId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}staff@interestingtimes.me`,
          firstName: "Arc",
          lastName: "Staff",
          regionId,
          joiningDate: new Date("2024-01-01T00:00:00.000Z"),
          role: "STAFF",
        },
      })
    ).id;

    // Give the employee an allowance period so previewLeave doesn't error on missing period.
    await db.allowancePeriod.create({
      data: {
        employeeId,
        regionId,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        opening: 20,
      },
    });

    ltId = await createLeaveType(actorId, {
      name: `${PREFIX}Study`,
      code: LT_CODE,
      color: "#6B5BD2",
      deductsAllowance: true,
      paid: true,
      noteRequired: false,
    });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: LT_CODE } });
    await db.region.deleteMany({ where: { name: `${PREFIX}region` } });
    await db.$disconnect();
  });

  it("active leave type appears in request picker", async () => {
    const ctx = await getRequestContext(employeeId);
    expect(ctx.leaveTypes.some((lt) => lt.id === ltId)).toBe(true);
  });

  it("archiving hides the type from the request picker", async () => {
    await setLeaveTypeActive(actorId, ltId, false);
    const ctx = await getRequestContext(employeeId);
    expect(ctx.leaveTypes.some((lt) => lt.id === ltId)).toBe(false);
  });

  it("previewLeave rejects an archived type", async () => {
    const result = await previewLeave(employeeId, {
      leaveTypeId: ltId,
      mode: "DAY",
      startDate: "2026-12-01",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("submitLeave does not create a request for an archived type", async () => {
    const result = await submitLeave(employeeId, {
      leaveTypeId: ltId,
      mode: "DAY",
      startDate: "2026-12-02",
    });
    expect(result.ok).toBe(false);
    const row = await db.leaveRequest.findFirst({ where: { employeeId, leaveTypeId: ltId } });
    expect(row).toBeNull();
  });

  it("audit log records the LEAVE_TYPE_RETIRE action", async () => {
    const evt = await db.auditEvent.findFirst({
      where: { action: "LEAVE_TYPE_RETIRE", entityId: ltId },
    });
    expect(evt).toBeTruthy();
  });

  it("restoring the type makes it bookable and visible again", async () => {
    await setLeaveTypeActive(actorId, ltId, true);

    const ctx = await getRequestContext(employeeId);
    expect(ctx.leaveTypes.some((lt) => lt.id === ltId)).toBe(true);

    const audit = await db.auditEvent.findFirst({
      where: { action: "LEAVE_TYPE_REACTIVATE", entityId: ltId },
    });
    expect(audit).toBeTruthy();
  });

  it("existing leave request keeps its leaveTypeId after archive+restore cycle (history intact)", async () => {
    // Seed a pre-existing approved request referencing this type.
    const req = await db.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: ltId,
        startDate: new Date("2025-03-01T00:00:00.000Z"),
        endDate: new Date("2025-03-01T00:00:00.000Z"),
        durationMode: "DAY",
        workingDays: 1,
        allowanceDays: 1,
        status: "APPROVED",
        createdById: employeeId,
      },
    });

    // Archive
    await setLeaveTypeActive(actorId, ltId, false);
    const afterArchive = await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(afterArchive.leaveTypeId).toBe(ltId);

    // Restore
    await setLeaveTypeActive(actorId, ltId, true);
    const afterRestore = await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(afterRestore.leaveTypeId).toBe(ltId);
  });
});
