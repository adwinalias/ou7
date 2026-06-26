import type { ISODate } from "./dates";

export interface RegionAssignment {
  regionId: string;
  effectiveFromISO: ISODate;
}

/**
 * Returns the regionId of the latest assignment whose effectiveFromISO <= dateISO.
 *
 * - Empty list → null.
 * - dateISO before the earliest effectiveFromISO → null.
 * - Boundary: effectiveFromISO === dateISO is effective (inclusive).
 * - Tie (same effectiveFromISO): last entry in input order wins — callers must
 *   pass assignments in a stable order (e.g. ascending createdAt from the DB).
 *
 * Input array is not mutated.
 */
export function regionOnDate(
  assignments: RegionAssignment[],
  dateISO: ISODate,
): string | null {
  // ponytail: ISO YYYY-MM-DD lexicographic compare is equivalent to date compare; no Date parsing needed.
  let result: RegionAssignment | null = null;
  for (const a of assignments) {
    if (a.effectiveFromISO <= dateISO) {
      // Keep if this is the first candidate, or if effectiveFromISO is >= current best
      // (>= so that a later entry with the same date overwrites — tie → last in input order).
      if (result === null || a.effectiveFromISO >= result.effectiveFromISO) {
        result = a;
      }
    }
  }
  return result ? result.regionId : null;
}
