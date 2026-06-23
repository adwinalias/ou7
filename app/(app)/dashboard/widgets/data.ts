// Per-request dedupe for the streamed dashboard widgets (Epic 21.2).
// Each widget is an independent async server component that awaits ONLY its own data, but
// several share an underlying read (e.g. getDashboard feeds both the Allowance and Alerts
// widgets, and the greeting). React cache() memoises the call for the duration of a single
// request/render so streaming the widgets in parallel does NOT re-issue the same query.
// Behaviour of the underlying lib fns is unchanged — this only deduplicates.
import { cache } from "react";
import { getDashboard, getUpcomingHolidays as _getUpcomingHolidays } from "@/lib/dashboard";
import { getHolidayBalance as _getHolidayBalance } from "@/lib/holiday-balance";
import { getWhosOff as _getWhosOff } from "@/lib/whosoff";
import { countPendingForApprover as _countPendingForApprover } from "@/lib/approvals";
import type { Actor } from "@/core/types";

export const cachedGetDashboard = cache(getDashboard);
export const cachedGetHolidayBalance = cache(_getHolidayBalance);
export const cachedGetUpcomingHolidays = cache(_getUpcomingHolidays);
export const cachedGetWhosOff = cache((actor: Actor) => _getWhosOff(actor));
export const cachedCountPending = cache((actor: Actor) => _countPendingForApprover(actor));

/** Dubai "today" as an ISO date (no clock read inside core). Shared by widgets. */
export function dubaiTodayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

/** The Dubai calendar year (for the Remote holiday ledger lookup). */
export function dubaiYear(): number {
  return Number(dubaiTodayISO().slice(0, 4));
}
