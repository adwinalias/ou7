// Integration tests for story 29.1 — staff restriction model (ADR-0014).
// Tests the lib layer directly against a real DB. Self-skips without a DB.
// Enforcement (clash detection) is story 29.2 — not tested here.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaffRestriction, deleteStaffRestriction, listStaffRestrictions } from "@/lib/restrictions";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[staff-restrictions.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "sr29-";

let uaeId = "";
let hrId = "";
let empAId = "";
let empBId = "";
let empCId = "";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

suite("Staff restrictions (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: { weekendDays: [6, 0] },
      create: { name: "UAE", weekendDays: [6, 0] },
    });
    uaeId = uae.id;

    // Clean up any leftovers from a previous run.
    const emails = [`${PREFIX}hr@it.me`, `${PREFIX}a@it.me`, `${PREFIX}b@it.me`, `${PREFIX}c@it.me`];
    const existing = await db.employee.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const existingIds = existing.map((e) => e.id);
    if (existingIds.length) {
      await db.staffRestriction.deleteMany({
        where: { OR: [{ employeeAId: { in: existingIds } }, { employeeBId: { in: existingIds } }] },
      });
      await db.auditEvent.deleteMany({ where: { actorId: { in: existingIds } } });
    }
    await db.employee.deleteMany({ where: { email: { in: emails } } });

    hrId = (await db.employee.create({ data: { email: `${PREFIX}hr@it.me`, firstName: "HR", lastName: "User", regionId: uaeId, joiningDate: day("2024-01-01"), role: "HR" } })).id;
    empAId = (await db.employee.create({ data: { email: `${PREFIX}a@it.me`, firstName: "Alice", lastName: "One", regionId: uaeId, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    empBId = (await db.employee.create({ data: { email: `${PREFIX}b@it.me`, firstName: "Bob", lastName: "Two", regionId: uaeId, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    empCId = (await db.employee.create({ data: { email: `${PREFIX}c@it.me`, firstName: "Carol", lastName: "Three", regionId: uaeId, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
  });

  afterAll(async () => {
    const emails = [`${PREFIX}hr@it.me`, `${PREFIX}a@it.me`, `${PREFIX}b@it.me`, `${PREFIX}c@it.me`];
    const existing = await db.employee.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const existingIds = existing.map((e) => e.id);
    if (existingIds.length) {
      await db.staffRestriction.deleteMany({
        where: { OR: [{ employeeAId: { in: existingIds } }, { employeeBId: { in: existingIds } }] },
      });
      await db.auditEvent.deleteMany({ where: { actorId: { in: existingIds } } });
      await db.employee.deleteMany({ where: { id: { in: existingIds } } });
    }
  });

  it("creates a restriction and records audit STAFF_RESTRICTION_CREATE", async () => {
    const id = await createStaffRestriction(hrId, {
      employeeAId: empAId,
      employeeBId: empBId,
      bidirectional: true,
      reason: "Same on-call role",
    });

    const row = await db.staffRestriction.findUniqueOrThrow({ where: { id } });
    expect(row.employeeAId).toBe(empAId);
    expect(row.employeeBId).toBe(empBId);
    expect(row.bidirectional).toBe(true);
    expect(row.reason).toBe("Same on-call role");

    const audit = await db.auditEvent.findFirst({
      where: { action: "STAFF_RESTRICTION_CREATE", entityId: id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(hrId);
  });

  it("rejects a self-pair (A === A)", async () => {
    await expect(
      createStaffRestriction(hrId, { employeeAId: empAId, employeeBId: empAId, bidirectional: true }),
    ).rejects.toThrow("themselves");
  });

  it("rejects a duplicate pair in the SAME order (A,B)", async () => {
    await expect(
      createStaffRestriction(hrId, { employeeAId: empAId, employeeBId: empBId, bidirectional: true }),
    ).rejects.toThrow("already exists");
  });

  it("rejects a duplicate pair in the REVERSE order (B,A)", async () => {
    await expect(
      createStaffRestriction(hrId, { employeeAId: empBId, employeeBId: empAId, bidirectional: false }),
    ).rejects.toThrow("already exists");
  });

  it("listStaffRestrictions returns the restriction with display names", async () => {
    const rows = await listStaffRestrictions();
    const match = rows.find((r) => r.employeeAId === empAId && r.employeeBId === empBId);
    expect(match).toBeDefined();
    expect(match!.employeeAName).toBe("Alice One");
    expect(match!.employeeBName).toBe("Bob Two");
    expect(match!.bidirectional).toBe(true);
    expect(match!.reason).toBe("Same on-call role");
  });

  it("allows a restriction involving a different pair (A,C)", async () => {
    const id = await createStaffRestriction(hrId, {
      employeeAId: empAId,
      employeeBId: empCId,
      bidirectional: false,
      reason: "Coverage",
    });
    expect(id).toBeTruthy();
    // Clean up immediately so it doesn't interfere with other tests.
    await deleteStaffRestriction(hrId, id);
  });

  it("deletes a restriction and records audit STAFF_RESTRICTION_DELETE", async () => {
    // Create a fresh one to delete.
    const id = await createStaffRestriction(hrId, {
      employeeAId: empBId,
      employeeBId: empCId,
      bidirectional: true,
    });

    await deleteStaffRestriction(hrId, id);

    const gone = await db.staffRestriction.findUnique({ where: { id } });
    expect(gone).toBeNull();

    const audit = await db.auditEvent.findFirst({
      where: { action: "STAFF_RESTRICTION_DELETE", entityId: id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(hrId);
  });
});
