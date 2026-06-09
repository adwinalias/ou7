// Integration tests for HR logs (Epic 9.4): create/list/delete, audited, private, and
// validation. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHRLog, deleteHRLog, listHRLogs } from "@/lib/hrlogs";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[hrlogs.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "hrlog-it-";
let employeeId = "";
let actorId = "";

suite("HR logs (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    await db.hRLog.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    employeeId = (await db.employee.create({ data: { email: `${PREFIX}emp@interestingtimes.me`, firstName: "Log", lastName: "Subject", regionId: uae.id, joiningDate: new Date("2024-01-01T00:00:00.000Z"), role: "STAFF" } })).id;
    actorId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "Log", lastName: "HR", regionId: uae.id, joiningDate: new Date("2024-01-01T00:00:00.000Z"), role: "HR" } })).id;
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.hRLog.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
  });

  it("creates a private HR log (audited, no notification persisted)", async () => {
    const before = await db.notification.count();
    const res = await createHRLog(actorId, { employeeId, type: "WFH", startISO: "2026-04-01", endISO: "2026-04-02", notes: "remote" });
    expect(res.ok).toBe(true);
    const log = await db.hRLog.findUniqueOrThrow({ where: { id: res.id! } });
    expect(log.isPrivate).toBe(true);
    expect(await db.notification.count()).toBe(before); // never notifies
    expect(await db.auditEvent.findFirst({ where: { action: "HR_LOG_CREATE", entityId: res.id! } })).toBeTruthy();
  });

  it("rejects an end-before-start range", async () => {
    const res = await createHRLog(actorId, { employeeId, type: "OOO", startISO: "2026-04-10", endISO: "2026-04-05" });
    expect(res.ok).toBe(false);
  });

  it("lists and deletes (audited)", async () => {
    const res = await createHRLog(actorId, { employeeId, type: "OOO", startISO: "2026-05-01", endISO: "2026-05-01" });
    expect((await listHRLogs()).some((l) => l.id === res.id)).toBe(true);
    await deleteHRLog(actorId, res.id!);
    expect((await listHRLogs()).some((l) => l.id === res.id)).toBe(false);
    expect(await db.auditEvent.findFirst({ where: { action: "HR_LOG_DELETE", entityId: res.id! } })).toBeTruthy();
  });
});
