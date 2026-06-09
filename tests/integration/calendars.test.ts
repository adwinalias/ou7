// Integration tests for Epic 10 against a real Postgres: holiday CRUD + clone, region
// weekend updates, restricted-day scoping, request-time enforcement, and that every write
// is audited. Self-skips without a DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cloneHolidays,
  createHoliday,
  createRestrictedDay,
  deleteHoliday,
  getRestrictedRangesFor,
  listHolidays,
  updateRegionWeekends,
} from "@/lib/calendars";
import { previewLeave } from "@/lib/leave";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[calendars.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "cal-it-";
const TYPE = "CALV";
let uaeId = "";
let ksaId = "";
let employeeId = "";
let actorId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

suite("Regional calendars & restricted days (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: { weekendDays: [6, 0] }, create: { name: "UAE", weekendDays: [6, 0] } });
    const ksa = await db.region.upsert({ where: { name: "KSA" }, update: { weekendDays: [5, 6] }, create: { name: "KSA", weekendDays: [5, 6] } });
    uaeId = uae.id;
    ksaId = ksa.id;

    await db.auditEvent.deleteMany({ where: { entity: { in: ["Holiday", "Region", "RestrictedDay"] }, actor: { email: { startsWith: PREFIX } } } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.restrictedDay.deleteMany({ where: { reason: { startsWith: PREFIX } } });
    await db.holiday.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });

    const type = await db.leaveType.create({ data: { name: "Cal Vacation", code: TYPE, color: "#2F6FEB", deductsAllowance: true } });
    employeeId = (await db.employee.create({ data: { email: `${PREFIX}staff@interestingtimes.me`, firstName: "Cal", lastName: "Staff", regionId: uaeId, joiningDate: day("2024-01-01"), role: "STAFF" } })).id;
    actorId = (await db.employee.create({ data: { email: `${PREFIX}hr@interestingtimes.me`, firstName: "Cal", lastName: "HR", regionId: uaeId, joiningDate: day("2024-01-01"), role: "HR" } })).id;
    await db.allowancePeriod.create({ data: { employeeId, regionId: uaeId, startDate: day("2026-01-01"), opening: 20 } });
    void type;
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: { in: [actorId, employeeId] } } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.restrictedDay.deleteMany({ where: { reason: { startsWith: PREFIX } } });
    await db.holiday.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: TYPE } });
    await db.$disconnect();
  });

  it("creates, lists and deletes holidays — each audited", async () => {
    const id = await createHoliday(actorId, { regionId: uaeId, dateISO: "2026-12-02", name: `${PREFIX}National Day` });
    let rows = await listHolidays(uaeId, 2026);
    expect(rows.find((h) => h.id === id)?.dateISO).toBe("2026-12-02");

    const created = await db.auditEvent.findFirst({ where: { action: "HOLIDAY_CREATE", entityId: id } });
    expect(created).toBeTruthy();

    await deleteHoliday(actorId, id);
    rows = await listHolidays(uaeId, 2026);
    expect(rows.some((h) => h.id === id)).toBe(false);
    expect(await db.auditEvent.findFirst({ where: { action: "HOLIDAY_DELETE", entityId: id } })).toBeTruthy();
  });

  it("clones holidays to the next year (same month/day), skipping existing", async () => {
    await createHoliday(actorId, { regionId: uaeId, dateISO: "2026-05-04", name: `${PREFIX}Clone Me` });
    const n = await cloneHolidays(actorId, uaeId, 2026);
    expect(n).toBeGreaterThanOrEqual(1);
    const next = await listHolidays(uaeId, 2027);
    expect(next.some((h) => h.dateISO === "2027-05-04")).toBe(true);
    // Re-clone skips the now-existing one.
    const again = await cloneHolidays(actorId, uaeId, 2026);
    expect(again).toBe(0);
  });

  it("updates region weekends (audited)", async () => {
    await updateRegionWeekends(actorId, ksaId, [5, 6]);
    const r = await db.region.findUniqueOrThrow({ where: { id: ksaId } });
    expect(r.weekendDays).toEqual([5, 6]);
    expect(await db.auditEvent.findFirst({ where: { action: "REGION_WEEKENDS_UPDATE", entityId: ksaId } })).toBeTruthy();
  });

  it("scopes restricted days: company applies to all; region applies only to its region", async () => {
    await createRestrictedDay(actorId, { scope: "COMPANY", startISO: "2026-03-02", endISO: "2026-03-02", reason: `${PREFIX}Company freeze` });
    await createRestrictedDay(actorId, { scope: "REGION", regionId: ksaId, startISO: "2026-03-10", endISO: "2026-03-10", reason: `${PREFIX}KSA only` });

    const ranges = await getRestrictedRangesFor(employeeId, "2026-03-01", "2026-03-31"); // UAE employee
    expect(ranges.some((r) => r.reason?.includes("Company freeze"))).toBe(true);
    expect(ranges.some((r) => r.reason?.includes("KSA only"))).toBe(false); // KSA-scoped, not for a UAE employee
  });

  it("blocks a request that overlaps a restricted day at preview (10.2)", async () => {
    const typeId = (await db.leaveType.findFirstOrThrow({ where: { code: TYPE } })).id;
    const res = await previewLeave(employeeId, { leaveTypeId: typeId, mode: "DAY", startDate: "2026-03-02" });
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/restricted period/i);
  });
});
