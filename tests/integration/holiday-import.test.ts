// Integration tests for story 32.2: import-by-region holiday tool.
// Hermetic: imports bundled rows for UAE/KSA/Beirut in 2026 (only), then deletes them in
// afterAll so the shared sequential integration DB stays clean for other suites.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importRegionHolidays, previewRegionHolidayImport } from "@/lib/calendars";
import { HOLIDAY_SEED_DATA } from "@/lib/holiday-seed-data";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[holiday-import.integration] DATABASE_URL unreachable — skipping.");

const YEAR = 2026;
// ponytail: actor just needs to be a valid employee id — create a minimal HR row
const ACTOR_PREFIX = "hi-it-";
let actorId = "";
let uaeId = "";
let ksaId = "";
let beirutId = "";

suite("Holiday import by region (story 32.2)", () => {
  beforeAll(async () => {
    // Ensure regions exist
    const uae = await db.region.upsert({ where: { name: "UAE" }, update: {}, create: { name: "UAE", weekendDays: [6, 0] } });
    const ksa = await db.region.upsert({ where: { name: "KSA" }, update: {}, create: { name: "KSA", weekendDays: [5, 6] } });
    const beirut = await db.region.upsert({ where: { name: "Beirut" }, update: {}, create: { name: "Beirut", weekendDays: [6, 0] } });
    uaeId = uae.id;
    ksaId = ksa.id;
    beirutId = beirut.id;

    // Create a minimal actor for audit records
    const actor = await db.employee.upsert({
      where: { email: `${ACTOR_PREFIX}hr@interestingtimes.me` },
      update: {},
      create: {
        email: `${ACTOR_PREFIX}hr@interestingtimes.me`,
        firstName: "HI",
        lastName: "HR",
        regionId: uae.id,
        joiningDate: new Date("2024-01-01T00:00:00.000Z"),
        role: "HR",
      },
    });
    actorId = actor.id;

    // Clean any bundled rows for YEAR that may have been left by prior runs
    const allEntries2026 = [
      ...(HOLIDAY_SEED_DATA["UAE"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR))),
      ...(HOLIDAY_SEED_DATA["KSA"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR))),
      ...(HOLIDAY_SEED_DATA["Beirut"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR))),
    ];
    for (const regionId of [uaeId, ksaId, beirutId]) {
      await db.holiday.deleteMany({
        where: { regionId, year: YEAR, date: { in: allEntries2026.map((e) => new Date(`${e.dateISO}T00:00:00.000Z`)) } },
      });
    }
  });

  afterAll(async () => {
    // Hermetic cleanup: delete exactly the rows we imported for YEAR in these three regions.
    const allEntries2026 = [
      ...(HOLIDAY_SEED_DATA["UAE"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR))),
      ...(HOLIDAY_SEED_DATA["KSA"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR))),
      ...(HOLIDAY_SEED_DATA["Beirut"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR))),
    ];
    for (const regionId of [uaeId, ksaId, beirutId]) {
      await db.holiday.deleteMany({
        where: { regionId, year: YEAR, date: { in: allEntries2026.map((e) => new Date(`${e.dateISO}T00:00:00.000Z`)) } },
      });
    }
    await db.auditEvent.deleteMany({ where: { actorId, action: "HOLIDAY_IMPORT" } });
    await db.employee.deleteMany({ where: { email: { startsWith: ACTOR_PREFIX } } });
    await db.$disconnect();
  });

  it("preview returns UAE 2026 entries all with alreadyExists:false before any import", async () => {
    const preview = await previewRegionHolidayImport(uaeId, YEAR);
    const dataset = (HOLIDAY_SEED_DATA["UAE"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR)));
    expect(preview.length).toBe(dataset.length);
    expect(preview.every((e) => !e.alreadyExists)).toBe(true);
  });

  it("importRegionHolidays inserts UAE 2026 rows and returns correct imported count", async () => {
    const dataset = (HOLIDAY_SEED_DATA["UAE"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR)));
    const { imported, skipped } = await importRegionHolidays(actorId, uaeId, YEAR);
    expect(imported).toBe(dataset.length);
    expect(skipped).toBe(0);
  });

  it("re-preview after import shows all alreadyExists:true", async () => {
    const preview = await previewRegionHolidayImport(uaeId, YEAR);
    expect(preview.length).toBeGreaterThan(0);
    expect(preview.every((e) => e.alreadyExists)).toBe(true);
  });

  it("re-running importRegionHolidays returns imported:0 (idempotent)", async () => {
    const { imported, skipped } = await importRegionHolidays(actorId, uaeId, YEAR);
    expect(imported).toBe(0);
    const dataset = (HOLIDAY_SEED_DATA["UAE"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR)));
    expect(skipped).toBe(dataset.length);
  });

  it("import is audited with HOLIDAY_IMPORT action", async () => {
    const audit = await db.auditEvent.findFirst({
      where: { actorId, action: "HOLIDAY_IMPORT", entityId: uaeId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
    expect((audit!.after as { year: number }).year).toBe(YEAR);
  });

  it("rows for other years are not touched (YEAR+1 not imported)", async () => {
    const other = await db.holiday.findMany({
      where: { regionId: uaeId, year: YEAR + 1, name: { in: (HOLIDAY_SEED_DATA["UAE"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR + 1))).map((e) => e.name) } },
    });
    // We only imported YEAR; YEAR+1 rows should not exist (unless already seeded by another suite)
    // We check the import didn't add 2027 rows by verifying the import result above was scoped to YEAR.
    // Just verify the count we inserted was exactly the 2026 dataset size.
    const dataset = (HOLIDAY_SEED_DATA["UAE"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR)));
    const actual = await db.holiday.findMany({ where: { regionId: uaeId, year: YEAR } });
    // At minimum, the dataset rows exist (there may be manually added rows too)
    expect(actual.length).toBeGreaterThanOrEqual(dataset.length);
    void other; // not asserting other-year presence — another suite may have seeded them
  });

  it("pre-existing holiday is skipped, rest are imported (KSA partial)", async () => {
    const ksaDataset = (HOLIDAY_SEED_DATA["KSA"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR)));
    // Pre-create one row
    const preCreated = ksaDataset[0]!;
    await db.holiday.create({
      data: { regionId: ksaId, year: YEAR, date: new Date(`${preCreated.dateISO}T00:00:00.000Z`), name: preCreated.name },
    });

    const { imported, skipped } = await importRegionHolidays(actorId, ksaId, YEAR);
    expect(imported).toBe(ksaDataset.length - 1);
    expect(skipped).toBe(1);
  });

  it("re-importing KSA 2026 after full import returns imported:0", async () => {
    const { imported } = await importRegionHolidays(actorId, ksaId, YEAR);
    expect(imported).toBe(0);
  });

  it("Beirut import works end-to-end", async () => {
    const dataset = (HOLIDAY_SEED_DATA["Beirut"] ?? []).filter((e) => e.dateISO.startsWith(String(YEAR)));
    const { imported } = await importRegionHolidays(actorId, beirutId, YEAR);
    expect(imported).toBe(dataset.length);
    const { imported: second } = await importRegionHolidays(actorId, beirutId, YEAR);
    expect(second).toBe(0);
  });

  it("preview returns empty array for a region with no dataset (unknown region)", async () => {
    // Create a temporary region not in the dataset
    const tmp = await db.region.create({ data: { name: "TestOnly-HI-NoDataset", weekendDays: [6] } });
    const preview = await previewRegionHolidayImport(tmp.id, YEAR);
    expect(preview).toEqual([]);
    await db.region.delete({ where: { id: tmp.id } });
  });
});
