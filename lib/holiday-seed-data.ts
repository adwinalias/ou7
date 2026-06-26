/**
 * Bundled public-holiday dataset for UAE, KSA, and Beirut — 2026 and 2027.
 * NO runtime network calls; this is static data (ADR-0003 / standalone).
 *
 * NOTE: Hijri (lunar) holidays are marked with [Hijri estimate]. Moon-sighting
 * determines the exact date locally; the dates below are the widely-published
 * expected Gregorian dates for each year. HR MUST confirm and adjust them via
 * the Holiday Admin UI (Epic 10) before the year begins — they are config-as-data,
 * fully editable after seeding.
 *
 * Fixed Gregorian dates are accurate.
 *
 * Remote mirrors UAE (Remote staff follow UAE weekends and public holidays per
 * the existing seed.ts policy; a distinct Remote dataset is not needed).
 */

export interface HolidaySeedEntry {
  dateISO: string; // YYYY-MM-DD
  name: string;
}

export const HOLIDAY_SEED_DATA: Record<string, HolidaySeedEntry[]> = {
  UAE: [
    // ── 2026 ──────────────────────────────────────────────────────────
    // Fixed Gregorian
    { dateISO: "2026-01-01", name: "New Year's Day" },
    // [Hijri estimate] Moon-sighting dependent — HR should confirm/adjust
    { dateISO: "2026-03-20", name: "Isra Mi'raj [Hijri estimate]" },
    { dateISO: "2026-03-29", name: "Eid al-Fitr (Day 1) [Hijri estimate]" },
    { dateISO: "2026-03-30", name: "Eid al-Fitr (Day 2) [Hijri estimate]" },
    { dateISO: "2026-03-31", name: "Eid al-Fitr (Day 3) [Hijri estimate]" },
    { dateISO: "2026-06-05", name: "Arafat Day (Eid al-Adha Eve) [Hijri estimate]" },
    { dateISO: "2026-06-06", name: "Eid al-Adha (Day 1) [Hijri estimate]" },
    { dateISO: "2026-06-07", name: "Eid al-Adha (Day 2) [Hijri estimate]" },
    { dateISO: "2026-06-08", name: "Eid al-Adha (Day 3) [Hijri estimate]" },
    { dateISO: "2026-06-26", name: "Islamic New Year (Hijri New Year) [Hijri estimate]" },
    { dateISO: "2026-09-04", name: "Prophet's Birthday (Mawlid) [Hijri estimate]" },
    // Fixed Gregorian
    { dateISO: "2026-12-01", name: "Commemoration Day" },
    { dateISO: "2026-12-02", name: "UAE National Day" },
    { dateISO: "2026-12-03", name: "UAE National Day (observed)" },
    // ── 2027 ──────────────────────────────────────────────────────────
    // Fixed Gregorian
    { dateISO: "2027-01-01", name: "New Year's Day" },
    // [Hijri estimate] Moon-sighting dependent — HR should confirm/adjust
    { dateISO: "2027-03-10", name: "Isra Mi'raj [Hijri estimate]" },
    { dateISO: "2027-03-18", name: "Eid al-Fitr (Day 1) [Hijri estimate]" },
    { dateISO: "2027-03-19", name: "Eid al-Fitr (Day 2) [Hijri estimate]" },
    { dateISO: "2027-03-20", name: "Eid al-Fitr (Day 3) [Hijri estimate]" },
    { dateISO: "2027-05-26", name: "Arafat Day (Eid al-Adha Eve) [Hijri estimate]" },
    { dateISO: "2027-05-27", name: "Eid al-Adha (Day 1) [Hijri estimate]" },
    { dateISO: "2027-05-28", name: "Eid al-Adha (Day 2) [Hijri estimate]" },
    { dateISO: "2027-05-29", name: "Eid al-Adha (Day 3) [Hijri estimate]" },
    { dateISO: "2027-06-15", name: "Islamic New Year (Hijri New Year) [Hijri estimate]" },
    { dateISO: "2027-08-24", name: "Prophet's Birthday (Mawlid) [Hijri estimate]" },
    // Fixed Gregorian
    { dateISO: "2027-12-01", name: "Commemoration Day" },
    { dateISO: "2027-12-02", name: "UAE National Day" },
    { dateISO: "2027-12-03", name: "UAE National Day (observed)" },
  ],

  KSA: [
    // ── 2026 ──────────────────────────────────────────────────────────
    // Fixed Gregorian
    { dateISO: "2026-02-22", name: "Saudi Founding Day" },
    // [Hijri estimate] Moon-sighting dependent — HR should confirm/adjust
    { dateISO: "2026-03-29", name: "Eid al-Fitr (Day 1) [Hijri estimate]" },
    { dateISO: "2026-03-30", name: "Eid al-Fitr (Day 2) [Hijri estimate]" },
    { dateISO: "2026-03-31", name: "Eid al-Fitr (Day 3) [Hijri estimate]" },
    { dateISO: "2026-04-01", name: "Eid al-Fitr (Day 4) [Hijri estimate]" },
    { dateISO: "2026-06-05", name: "Arafat Day (Eid al-Adha Eve) [Hijri estimate]" },
    { dateISO: "2026-06-06", name: "Eid al-Adha (Day 1) [Hijri estimate]" },
    { dateISO: "2026-06-07", name: "Eid al-Adha (Day 2) [Hijri estimate]" },
    { dateISO: "2026-06-08", name: "Eid al-Adha (Day 3) [Hijri estimate]" },
    { dateISO: "2026-06-09", name: "Eid al-Adha (Day 4) [Hijri estimate]" },
    // Fixed Gregorian
    { dateISO: "2026-09-23", name: "Saudi National Day" },
    // [Hijri estimate]
    { dateISO: "2026-06-26", name: "Islamic New Year (Hijri New Year) [Hijri estimate]" },
    { dateISO: "2026-09-04", name: "Prophet's Birthday (Mawlid) [Hijri estimate]" },
    // ── 2027 ──────────────────────────────────────────────────────────
    // Fixed Gregorian
    { dateISO: "2027-02-22", name: "Saudi Founding Day" },
    // [Hijri estimate] Moon-sighting dependent — HR should confirm/adjust
    { dateISO: "2027-03-18", name: "Eid al-Fitr (Day 1) [Hijri estimate]" },
    { dateISO: "2027-03-19", name: "Eid al-Fitr (Day 2) [Hijri estimate]" },
    { dateISO: "2027-03-20", name: "Eid al-Fitr (Day 3) [Hijri estimate]" },
    { dateISO: "2027-03-21", name: "Eid al-Fitr (Day 4) [Hijri estimate]" },
    { dateISO: "2027-05-26", name: "Arafat Day (Eid al-Adha Eve) [Hijri estimate]" },
    { dateISO: "2027-05-27", name: "Eid al-Adha (Day 1) [Hijri estimate]" },
    { dateISO: "2027-05-28", name: "Eid al-Adha (Day 2) [Hijri estimate]" },
    { dateISO: "2027-05-29", name: "Eid al-Adha (Day 3) [Hijri estimate]" },
    { dateISO: "2027-05-30", name: "Eid al-Adha (Day 4) [Hijri estimate]" },
    // Fixed Gregorian
    { dateISO: "2027-09-23", name: "Saudi National Day" },
    // [Hijri estimate]
    { dateISO: "2027-06-15", name: "Islamic New Year (Hijri New Year) [Hijri estimate]" },
    { dateISO: "2027-08-24", name: "Prophet's Birthday (Mawlid) [Hijri estimate]" },
  ],

  Beirut: [
    // ── 2026 ──────────────────────────────────────────────────────────
    // Fixed Gregorian
    { dateISO: "2026-01-01", name: "New Year's Day" },
    { dateISO: "2026-01-06", name: "Armenian Christmas (Orthodox Epiphany)" },
    { dateISO: "2026-02-09", name: "Saint Maroun's Day" },
    // [Hijri estimate] Moon-sighting dependent — HR should confirm/adjust
    { dateISO: "2026-03-29", name: "Eid al-Fitr [Hijri estimate]" },
    { dateISO: "2026-03-30", name: "Eid al-Fitr (Day 2) [Hijri estimate]" },
    // Fixed Gregorian (Western Easter 2026 is April 5; Orthodox Easter 2026 is April 12)
    { dateISO: "2026-04-05", name: "Easter Sunday (Western)" },
    { dateISO: "2026-04-06", name: "Easter Monday (Western)" },
    { dateISO: "2026-04-12", name: "Easter Sunday (Orthodox)" },
    { dateISO: "2026-04-13", name: "Easter Monday (Orthodox)" },
    // Fixed Gregorian
    { dateISO: "2026-05-01", name: "Labour Day" },
    { dateISO: "2026-05-06", name: "Martyrs' Day" },
    // [Hijri estimate]
    { dateISO: "2026-06-06", name: "Eid al-Adha [Hijri estimate]" },
    { dateISO: "2026-06-07", name: "Eid al-Adha (Day 2) [Hijri estimate]" },
    { dateISO: "2026-06-26", name: "Islamic New Year (Hijri New Year) [Hijri estimate]" },
    // Fixed Gregorian
    { dateISO: "2026-08-15", name: "Assumption of Mary" },
    { dateISO: "2026-09-04", name: "Prophet's Birthday (Mawlid) [Hijri estimate]" },
    { dateISO: "2026-11-01", name: "All Saints' Day" },
    { dateISO: "2026-11-22", name: "Independence Day" },
    { dateISO: "2026-12-25", name: "Christmas Day" },
    // ── 2027 ──────────────────────────────────────────────────────────
    // Fixed Gregorian
    { dateISO: "2027-01-01", name: "New Year's Day" },
    { dateISO: "2027-01-06", name: "Armenian Christmas (Orthodox Epiphany)" },
    { dateISO: "2027-02-09", name: "Saint Maroun's Day" },
    // [Hijri estimate] Moon-sighting dependent — HR should confirm/adjust
    { dateISO: "2027-03-18", name: "Eid al-Fitr [Hijri estimate]" },
    { dateISO: "2027-03-19", name: "Eid al-Fitr (Day 2) [Hijri estimate]" },
    // Fixed Gregorian (Western Easter 2027 is March 28; Orthodox Easter 2027 is May 2)
    { dateISO: "2027-03-28", name: "Easter Sunday (Western)" },
    { dateISO: "2027-03-29", name: "Easter Monday (Western)" },
    { dateISO: "2027-05-02", name: "Easter Sunday (Orthodox)" },
    { dateISO: "2027-05-03", name: "Easter Monday (Orthodox)" },
    // Fixed Gregorian
    { dateISO: "2027-05-01", name: "Labour Day" },
    { dateISO: "2027-05-06", name: "Martyrs' Day" },
    // [Hijri estimate]
    { dateISO: "2027-05-27", name: "Eid al-Adha [Hijri estimate]" },
    { dateISO: "2027-05-28", name: "Eid al-Adha (Day 2) [Hijri estimate]" },
    { dateISO: "2027-06-15", name: "Islamic New Year (Hijri New Year) [Hijri estimate]" },
    // Fixed Gregorian
    { dateISO: "2027-08-15", name: "Assumption of Mary" },
    { dateISO: "2027-08-24", name: "Prophet's Birthday (Mawlid) [Hijri estimate]" },
    { dateISO: "2027-11-01", name: "All Saints' Day" },
    { dateISO: "2027-11-22", name: "Independence Day" },
    { dateISO: "2027-12-25", name: "Christmas Day" },
  ],
};
