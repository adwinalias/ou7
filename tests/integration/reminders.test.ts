// Integration tests for send-reminder (Epic 5.7): increments follow-up count, audits,
// owner/HR only, pending-only. Self-skips without a DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sendReminder } from "@/lib/reminders";
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
if (!dbUp) console.warn("[reminders.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "rem-it-";
const TYPE = "REMV";
let ownerId = "";
let hrId = "";
let otherId = "";
let typeId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const actor = (over: Partial<Actor> & Pick<Actor, "employeeId" | "role">): Actor => ({ approverLevel: "NONE", status: "ACTIVE", approverForIds: [], ...over });

async function mkRequest(status: "PENDING" | "APPROVED") {
  return db.leaveRequest.create({ data: { employeeId: ownerId, leaveTypeId: typeId, startDate: day("2026-12-01"), endDate: day("2026-12-01"), durationMode: "DAY", workingDays: 1, allowanceDays: 1, status, createdById: ownerId } });
}

suite("Send reminder (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    typeId = (await db.leaveType.create({ data: { name: "Rem Vacation", code: TYPE, color: "#2F6FEB", deductsAllowance: true } })).id;
    ownerId = (await db.employee.create({ data: { email: `${PREFIX}owner@interestingtimes.me`, firstName: "Own", lastName: "Er", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    hrId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "H", lastName: "R", regionId: uae.id, joiningDate: day("2024-01-01"), role: "HR" } })).id;
    otherId = (await db.employee.create({ data: { email: `${PREFIX}other@interestingtimes.me`, firstName: "Ot", lastName: "Her", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId: ownerId } });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: { in: [ownerId, hrId, otherId] } } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    await db.$disconnect();
  });

  it("owner reminds their PENDING request: count increments + audited", async () => {
    const req = await mkRequest("PENDING");
    const res = await sendReminder(actor({ employeeId: ownerId, role: "STAFF" }), req.id);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.followUpCount).toBe(1);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).followUpCount).toBe(1);
    expect(await db.auditEvent.findFirst({ where: { action: "LEAVE_REMINDER", entityId: req.id } })).toBeTruthy();
  });

  it("HR can remind too; count keeps incrementing", async () => {
    const req = await mkRequest("PENDING");
    await sendReminder(actor({ employeeId: ownerId, role: "STAFF" }), req.id);
    const res = await sendReminder(actor({ employeeId: hrId, role: "HR" }), req.id);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.followUpCount).toBe(2);
  });

  it("rejects a non-owner non-HR with 403", async () => {
    const req = await mkRequest("PENDING");
    await expect(sendReminder(actor({ employeeId: otherId, role: "STAFF" }), req.id)).rejects.toBeInstanceOf(AuthError);
  });

  it("only pending requests can be reminded", async () => {
    const req = await mkRequest("APPROVED");
    const res = await sendReminder(actor({ employeeId: ownerId, role: "STAFF" }), req.id);
    expect(res.ok).toBe(false);
  });
});
