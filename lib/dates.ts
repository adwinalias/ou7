import type { ISODate } from "@/core/types";

/**
 * Today as an ISO date (YYYY-MM-DD) in Asia/Dubai — all scheduling/date logic is
 * Dubai time (CLAUDE.md guardrail #7). This reads the wall clock, so it lives in
 * lib (the edge) and NOT in the deterministic core/ (see core/dates.ts and the
 * "no clock read here" note on greetingForHour).
 */
export const dubaiTodayISO = (): ISODate =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
