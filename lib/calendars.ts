// Regional calendar administration (Epic 10): region weekends, per-region public holidays
// (10.1) + clone last year (10.4), and restricted/blackout days (10.2). All writes are
// audited (Epic 16.1). HR enters real dates via the UI — nothing is seeded.
import type { RestrictedRange } from "@/core/types";
import { recordAudit } from "./audit";
import { db } from "./db";
import { HOLIDAY_SEED_DATA } from "./holiday-seed-data";

const atUtc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toISO = (d: Date) => d.toISOString().slice(0, 10);

// ─── Region weekends (10.1) ──────────────────────────────────────────────────────
export async function updateRegionWeekends(actorId: string, regionId: string, weekendDays: number[]) {
  const before = await db.region.findUniqueOrThrow({ where: { id: regionId }, select: { weekendDays: true } });
  const clean = [...new Set(weekendDays.filter((d) => d >= 0 && d <= 6))].sort();
  await db.region.update({ where: { id: regionId }, data: { weekendDays: clean } });
  await recordAudit(db, { actorId, action: "REGION_WEEKENDS_UPDATE", entity: "Region", entityId: regionId, before, after: { weekendDays: clean } });
}

// ─── Holidays (10.1) ───────────────────────────────────────────────────────────
export async function listHolidays(regionId: string, year: number) {
  const rows = await db.holiday.findMany({ where: { regionId, year }, orderBy: { date: "asc" } });
  return rows.map((h) => ({ id: h.id, dateISO: toISO(h.date), name: h.name }));
}

export async function createHoliday(actorId: string, input: { regionId: string; dateISO: string; name: string }) {
  const date = atUtc(input.dateISO);
  const holiday = await db.holiday.create({
    data: { regionId: input.regionId, year: date.getUTCFullYear(), date, name: input.name.trim() },
  });
  await recordAudit(db, { actorId, action: "HOLIDAY_CREATE", entity: "Holiday", entityId: holiday.id, after: { regionId: input.regionId, dateISO: input.dateISO, name: holiday.name } });
  return holiday.id;
}

export async function deleteHoliday(actorId: string, id: string) {
  const before = await db.holiday.findUnique({ where: { id } });
  if (!before) return;
  await db.holiday.delete({ where: { id } });
  await recordAudit(db, { actorId, action: "HOLIDAY_DELETE", entity: "Holiday", entityId: id, before: { regionId: before.regionId, dateISO: toISO(before.date), name: before.name } });
}

/** Clone a region's holidays from one year to the next (same month/day, +1 year), skipping
 *  any that already exist. HR then edits the moved dates (10.4). Returns how many cloned. */
export async function cloneHolidays(actorId: string, regionId: string, fromYear: number) {
  const toYear = fromYear + 1;
  const source = await db.holiday.findMany({ where: { regionId, year: fromYear } });
  const existing = new Set((await db.holiday.findMany({ where: { regionId, year: toYear }, select: { date: true } })).map((h) => toISO(h.date)));

  let cloned = 0;
  for (const h of source) {
    const d = new Date(h.date);
    d.setUTCFullYear(toYear);
    const iso = toISO(d);
    if (existing.has(iso)) continue;
    await db.holiday.create({ data: { regionId, year: toYear, date: d, name: h.name } });
    cloned++;
  }
  await recordAudit(db, { actorId, action: "HOLIDAY_CLONE", entity: "Region", entityId: regionId, after: { fromYear, toYear, cloned } });
  return cloned;
}

// ─── Bundled holiday import (story 32.2) ──────────────────────────────────────────

export interface HolidayImportPreviewEntry {
  dateISO: string;
  name: string;
  alreadyExists: boolean;
}

/** Resolve the dataset key for a region: Remote mirrors UAE per the 32.1 policy. */
function datasetKey(regionName: string): string {
  return regionName === "Remote" ? "UAE" : regionName;
}

/**
 * Read-only preview: returns the bundled entries for the region/year with an
 * `alreadyExists` flag for each. Returns `[]` if no dataset covers this region.
 */
export async function previewRegionHolidayImport(regionId: string, year: number): Promise<HolidayImportPreviewEntry[]> {
  const region = await db.region.findUnique({ where: { id: regionId }, select: { name: true } });
  if (!region) return [];

  const entries = (HOLIDAY_SEED_DATA[datasetKey(region.name)] ?? []).filter((e) => e.dateISO.startsWith(String(year)));
  if (entries.length === 0) return [];

  const existing = new Set(
    (await db.holiday.findMany({ where: { regionId, year }, select: { date: true } })).map((h) => h.date.toISOString().slice(0, 10)),
  );

  return entries.map((e) => ({ dateISO: e.dateISO, name: e.name, alreadyExists: existing.has(e.dateISO) }));
}

/**
 * Insert the missing bundled entries for this region/year, skip existing rows (idempotent),
 * and write one HOLIDAY_IMPORT audit event. Returns `{ imported, skipped }`.
 */
export async function importRegionHolidays(actorId: string, regionId: string, year: number): Promise<{ imported: number; skipped: number }> {
  const region = await db.region.findUnique({ where: { id: regionId }, select: { name: true } });
  if (!region) return { imported: 0, skipped: 0 };

  const entries = (HOLIDAY_SEED_DATA[datasetKey(region.name)] ?? []).filter((e) => e.dateISO.startsWith(String(year)));

  const existing = new Set(
    (await db.holiday.findMany({ where: { regionId, year }, select: { date: true } })).map((h) => h.date.toISOString().slice(0, 10)),
  );

  let imported = 0;
  let skipped = 0;
  for (const { dateISO, name } of entries) {
    if (existing.has(dateISO)) { skipped++; continue; }
    const date = atUtc(dateISO);
    await db.holiday.create({ data: { regionId, year: date.getUTCFullYear(), date, name } });
    imported++;
  }

  await recordAudit(db, { actorId, action: "HOLIDAY_IMPORT", entity: "Region", entityId: regionId, after: { regionId, year, imported } });
  return { imported, skipped };
}

// ─── Restricted / blackout days (10.2) ───────────────────────────────────────────
export type RestrictedScope = "COMPANY" | "DEPARTMENT" | "REGION";

export async function listRestrictedDays() {
  const rows = await db.restrictedDay.findMany({
    orderBy: { startDate: "asc" },
    include: { region: { select: { name: true } }, department: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    scopeLabel: r.scope === "REGION" ? (r.region?.name ?? "—") : r.scope === "DEPARTMENT" ? (r.department?.name ?? "—") : "Company",
    startISO: toISO(r.startDate),
    endISO: toISO(r.endDate),
    reason: r.reason,
  }));
}

export async function createRestrictedDay(
  actorId: string,
  input: { scope: RestrictedScope; regionId?: string | null; departmentId?: string | null; startISO: string; endISO: string; reason?: string },
) {
  const created = await db.restrictedDay.create({
    data: {
      scope: input.scope,
      regionId: input.scope === "REGION" ? (input.regionId ?? null) : null,
      departmentId: input.scope === "DEPARTMENT" ? (input.departmentId ?? null) : null,
      startDate: atUtc(input.startISO),
      endDate: atUtc(input.endISO),
      reason: input.reason?.trim() || null,
    },
  });
  await recordAudit(db, { actorId, action: "RESTRICTED_CREATE", entity: "RestrictedDay", entityId: created.id, after: { scope: input.scope, startISO: input.startISO, endISO: input.endISO, reason: created.reason } });
  return created.id;
}

export async function deleteRestrictedDay(actorId: string, id: string) {
  const before = await db.restrictedDay.findUnique({ where: { id } });
  if (!before) return;
  await db.restrictedDay.delete({ where: { id } });
  await recordAudit(db, { actorId, action: "RESTRICTED_DELETE", entity: "RestrictedDay", entityId: id, before: { scope: before.scope, startISO: toISO(before.startDate), endISO: toISO(before.endDate) } });
}

/** Restricted ranges that apply to an employee over a window — company-wide, plus their
 *  region and department — for the request-time block (Epic 10.2). */
export async function getRestrictedRangesFor(employeeId: string, fromISO: string, toISO_: string): Promise<RestrictedRange[]> {
  const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { regionId: true, departmentId: true } });
  const rows = await db.restrictedDay.findMany({
    where: {
      startDate: { lte: atUtc(toISO_) },
      endDate: { gte: atUtc(fromISO) },
      OR: [
        { scope: "COMPANY" },
        { scope: "REGION", regionId: emp.regionId },
        ...(emp.departmentId ? [{ scope: "DEPARTMENT" as const, departmentId: emp.departmentId }] : []),
      ],
    },
    select: { startDate: true, endDate: true, reason: true },
  });
  return rows.map((r) => ({ startISO: toISO(r.startDate), endISO: toISO(r.endDate), reason: r.reason ?? undefined }));
}
