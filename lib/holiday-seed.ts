/**
 * Idempotent seeder for bundled public holidays (story 32.1).
 * Pre-fetches existing dates per region in one query, then only creates missing rows.
 * A second run inserts 0 rows (no unique-constraint crash).
 * No audit trail: this is bundled static config, not an HR action.
 *
 * Accepts an optional PrismaClient so prisma/seed.ts can pass its own instance
 * (avoiding the server-only guard on lib/db.ts during seed runs).
 */
import { db as defaultDb } from "./db";
import { HOLIDAY_SEED_DATA } from "./holiday-seed-data";
import type { PrismaClient } from "@prisma/client";

/**
 * Seed all bundled holidays into the DB.
 * Skips any region not found in the DB (clean noop — no crash).
 * Returns the number of *newly created* rows; returns 0 on a re-run (idempotent).
 *
 * @param client - optional PrismaClient; defaults to the shared lib/db singleton.
 */
export async function seedBundledHolidays(client?: PrismaClient): Promise<number> {
  // ponytail: cast needed because lib/db exports a typed subtype; both are compatible at runtime
  const prisma = (client ?? defaultDb) as PrismaClient;
  let created = 0;

  for (const [regionName, entries] of Object.entries(HOLIDAY_SEED_DATA)) {
    const region = await prisma.region.findUnique({ where: { name: regionName } });
    if (!region) continue; // region not yet seeded — skip cleanly

    // Fetch all existing dates for this region in one query.
    const existingDates = new Set(
      (await prisma.holiday.findMany({ where: { regionId: region.id }, select: { date: true } })).map((h) =>
        h.date.toISOString().slice(0, 10),
      ),
    );

    for (const { dateISO, name } of entries) {
      if (existingDates.has(dateISO)) continue; // already present — skip

      const date = new Date(`${dateISO}T00:00:00.000Z`);
      await prisma.holiday.create({
        data: { regionId: region.id, year: date.getUTCFullYear(), date, name },
      });
      created++;
    }
  }

  return created;
}
