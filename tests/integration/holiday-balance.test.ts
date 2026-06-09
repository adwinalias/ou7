// Integration tests for the Remote Holiday balance (v2b / ADR-0010): default, set+audit,
// Remote-only guard, validation. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getHolidayBalance, setHolidayBalance } from "@/lib/holiday-balance";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[holiday-balance.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "hb-it-";
let remoteId = "";
let uaeEmpId = "";
let actorId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

suite("Remote Holiday balance (integration)", () => {
  beforeAll(async () => {
    const remote = await db.region.upsert({ where: { name: "Remote" }, update: {}, create: { name: "Remote", weekendDays: [6, 0] } });
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    await db.holidayBalance.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    remoteId = (await db.employee.create({ data: { email: `${PREFIX}remote@interestingtimes.me`, firstName: "Rem", lastName: "Ote", regionId: remote.id, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    uaeEmpId = (await db.employee.create({ data: { email: `${PREFIX}uae@interestingtimes.me`, firstName: "U", lastName: "AE", regionId: uae.id, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    actorId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "HB", lastName: "HR", regionId: remote.id, joiningDate: day("2024-01-01"), role: "HR" } })).id;
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.holidayBalance.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
  });

  it("defaults a Remote employee to 5 and is null for non-Remote", async () => {
    expect(await getHolidayBalance(remoteId, 2026)).toBe(5);
    expect(await getHolidayBalance(uaeEmpId, 2026)).toBeNull();
  });

  it("HR sets the balance for a Remote employee (audited)", async () => {
    const res = await setHolidayBalance(actorId, remoteId, 2026, 8);
    expect(res.ok).toBe(true);
    expect(await getHolidayBalance(remoteId, 2026)).toBe(8);
    expect(await db.auditEvent.findFirst({ where: { action: "HOLIDAY_BALANCE_SET", entityId: remoteId } })).toBeTruthy();
  });

  it("refuses to set for a non-Remote employee", async () => {
    const res = await setHolidayBalance(actorId, uaeEmpId, 2026, 5);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/remote/i);
  });

  it("rejects negative days", async () => {
    expect((await setHolidayBalance(actorId, remoteId, 2026, -1)).ok).toBe(false);
  });
});
