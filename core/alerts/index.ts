// Dashboard alerts (Epic 18.6). PURE — no I/O, no DB, no Next, NO AI/LLM. Deterministic
// rule-based nudges only. The dashboard (app/) gathers the inputs (balance, pending count,
// region×role policy, today in Asia/Dubai) and hands them in; this module decides which
// nudges to surface and where each links. (Guardrail: every calculation is tested code in
// core/ — ADR 0003.) The clock is NEVER read here; `todayISO` is passed in by the caller.

export interface DashboardAlert {
  id: string;
  severity: "info" | "warn";
  message: string;
  href: string;
}

export interface DashboardAlertsInput {
  /** Does the viewer have an open allowance period? Gates the "0 days booked" nudge. */
  hasPeriod: boolean;
  /** Carry-over days brought into the open period (balance.carryOver). */
  carryOverDays: number;
  /** Policy carry-over expiry as "MM-DD", or null when HR hasn't set one → no expiry alert. */
  carryOverExpiryMMDD: string | null;
  /** Today in Asia/Dubai as "YYYY-MM-DD" (computed at the edge; never read here). */
  todayISO: string;
  /** How many days before expiry the warning starts. Defaults to 60. */
  daysWindow?: number;
  /** Pending approvals waiting on the viewer (0 for non-approvers). */
  pendingApprovalsCount: number;
  /** Days booked in the open period = takenApproved + pending. */
  daysBooked: number;
}

const DAY_MS = 86_400_000;
const DEFAULT_DAYS_WINDOW = 60;

/** "YYYY-MM-DD" → UTC ms at midnight. Returns NaN for a malformed string. */
function utcMsFromISO(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Validate an "MM-DD" string. Returns [month, day] (1-based month) or null. */
function parseMMDD(mmdd: string): [number, number] | null {
  const m = /^(\d{2})-(\d{2})$/.exec(mmdd);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return [month, day];
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Human label for an MM-DD, e.g. [3,31] → "31 Mar". Pure, locale-free. */
function labelMMDD(month: number, day: number): string {
  return `${day} ${MONTH_ABBR[month - 1]}`;
}

/**
 * Whole days from `todayISO` to the policy expiry MM-DD in the SAME calendar year as today.
 * Positive = expiry is in the future; 0 = expiry is today; negative = already passed this
 * year. Returns NaN if either input is malformed. (Date-part comparison only; no clock.)
 */
function daysUntilExpiry(todayISO: string, mmdd: string): number {
  const today = utcMsFromISO(todayISO);
  const parsed = parseMMDD(mmdd);
  if (Number.isNaN(today) || !parsed) return NaN;
  const year = Number(todayISO.slice(0, 4));
  const expiry = Date.UTC(year, parsed[0] - 1, parsed[1]);
  return Math.round((expiry - today) / DAY_MS);
}

/**
 * Compute the dashboard alerts, in display order:
 *   1. carry-over expiring — viewer has carry-over (>0), a policy expiry is set, and that
 *      expiry (this calendar year) is today-or-later AND within `daysWindow` days → /my-leave.
 *      (warn)
 *   2. a request is waiting on you — pendingApprovalsCount > 0 → /approvals. (warn)
 *   3. 0 days booked — viewer HAS a period but has booked 0 days → /request. (info)
 * Deterministic and side-effect-free; identical inputs always yield identical output.
 */
export function computeDashboardAlerts(input: DashboardAlertsInput): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  const window = input.daysWindow ?? DEFAULT_DAYS_WINDOW;

  // (a) Carry-over expiring soon.
  if (input.carryOverDays > 0 && input.carryOverExpiryMMDD) {
    const parsed = parseMMDD(input.carryOverExpiryMMDD);
    const days = daysUntilExpiry(input.todayISO, input.carryOverExpiryMMDD);
    // Window is inclusive of today (0) up to and including `window` days out. An expiry that
    // has already passed this year (negative) does not fire.
    if (parsed && !Number.isNaN(days) && days >= 0 && days <= window) {
      const n = input.carryOverDays;
      alerts.push({
        id: "carry-over-expiring",
        severity: "warn",
        message: `${n} carry-over day${n === 1 ? "" : "s"} expire on ${labelMMDD(parsed[0], parsed[1])} — use ${n === 1 ? "it" : "them"} or lose ${n === 1 ? "it" : "them"}.`,
        href: "/my-leave",
      });
    }
  }

  // (b) A request is waiting on you.
  if (input.pendingApprovalsCount > 0) {
    const c = input.pendingApprovalsCount;
    alerts.push({
      id: "pending-approvals",
      severity: "warn",
      message: `${c} request${c === 1 ? "" : "s"} ${c === 1 ? "is" : "are"} waiting for your decision.`,
      href: "/approvals",
    });
  }

  // (c) 0 days booked — only meaningful when the viewer actually has an allowance period.
  if (input.hasPeriod && input.daysBooked === 0) {
    alerts.push({
      id: "no-days-booked",
      severity: "info",
      message: "You haven't booked any leave yet this period — plan some time off.",
      href: "/request",
    });
  }

  return alerts;
}
