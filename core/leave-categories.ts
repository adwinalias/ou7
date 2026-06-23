// Four-category leave abstraction (V2 decision #5). PURE — no I/O, no DB, no Next.
// Maps a specific leave-type CODE to one of four public categories so that non-HR
// viewers on shared/company-wide surfaces (dashboard "Who's off" widget — Epic 18.2,
// shared key — 19.1, Team Calendar — 19.7) never see the specific personal leave type.
// HR keeps the real type everywhere; the mapping is only applied to non-HR payloads,
// which is decided server-side in lib/ (never trust the client).
export type LeaveCategory = "Out" | "Sick (non-working)" | "Sick (WFH)" | "National Holiday";

/**
 * Map a leave-type code to its public category.
 *   SN → Sick (non-working)
 *   SW → Sick (WFH)
 *   H  → National Holiday
 *   everything else (V, B, M, P, W, O, …) → Out
 * Case-insensitive on the code so seed/config casing can't leak a specific type.
 */
export function leaveCategory(code: string): LeaveCategory {
  switch (code.trim().toUpperCase()) {
    case "SN":
      return "Sick (non-working)";
    case "SW":
      return "Sick (WFH)";
    case "H":
      return "National Holiday";
    default:
      return "Out";
  }
}

/**
 * The four public categories shown on shared/company-wide surfaces, in display order.
 * SINGLE SOURCE OF TRUTH for the shared key (19.1), the dashboard tiles (18.5) and the
 * Team Calendar (19.7) — change it here and every consuming surface updates.
 */
export const LEAVE_CATEGORIES: LeaveCategory[] = [
  "Out",
  "Sick (non-working)",
  "Sick (WFH)",
  "National Holiday",
];

/**
 * The CSS variable (NOT a hex) that paints a category's swatch/cell fill. Keeps colour a
 * token so themes re-map in one place. "Out" uses the representative out-of-office hue
 * (vacation blue) since it abstracts every non-sick, non-holiday type.
 */
export function categoryColorVar(c: LeaveCategory): string {
  switch (c) {
    case "Sick (non-working)":
      return "var(--lt-sick-not)";
    case "Sick (WFH)":
      return "var(--lt-sick-working)";
    case "National Holiday":
      return "var(--lt-national-holiday)";
    case "Out":
      return "var(--lt-vacation)";
  }
}
