// Alerts widget (Epic 18.6; streamed per 21.2). Async server component: gathers its own
// inputs then renders the deterministic nudges from the pure core/alerts. Each is a
// keyboard-operable link with a severity cue that is NEVER colour-only (coloured left bar +
// the alert text). Markup/testids (alerts-list / alerts-empty / alert-item / alert-link-*) kept.
import Link from "next/link";
import type { Route } from "next";
import { computeDashboardAlerts } from "@/core/alerts";
import type { Actor } from "@/core/types";
import { cachedGetDashboard, cachedCountPending, dubaiTodayISO } from "./data";

export default async function AlertsWidget({ actor, approver }: { actor: Actor; approver: boolean }) {
  // Gather inputs only; the pure core/alerts decides which to surface. The pending count is
  // approver-only (0 otherwise → the "waiting on you" rule never fires for non-approvers).
  const [{ balance, carryOverExpiryMMDD }, pendingCount] = await Promise.all([
    cachedGetDashboard(actor.employeeId),
    approver ? cachedCountPending(actor) : Promise.resolve(0),
  ]);
  const alerts = computeDashboardAlerts({
    hasPeriod: !!balance,
    carryOverDays: balance?.carryOver ?? 0,
    carryOverExpiryMMDD,
    todayISO: dubaiTodayISO(),
    pendingApprovalsCount: pendingCount,
    daysBooked: (balance?.takenApproved ?? 0) + (balance?.pending ?? 0),
  });

  return (
    <>
      <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>Alerts</div>
      {alerts.length === 0 ? (
        <p className="t-muted" data-testid="alerts-empty">You&apos;re all caught up — no alerts.</p>
      ) : (
        <ul
          data-testid="alerts-list"
          style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
        >
          {alerts.map((a) => {
            // Severity drives the left-bar colour only; the message text always carries the
            // meaning, so colour is never the sole signal (design system §2, WCAG).
            const barColor = a.severity === "warn" ? "var(--lt-vacation)" : "var(--border-strong)";
            return (
              <li key={a.id} data-testid="alert-item">
                <Link
                  // core/alerts emits only known app routes (/my-leave, /approvals,
                  // /request); cast keeps core decoupled from Next's typed-routes union.
                  href={a.href as Route}
                  data-testid={`alert-link-${a.id}`}
                  className="alert-link"
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "var(--space-2)",
                    minHeight: 40,
                    padding: "var(--space-2) var(--space-3)",
                    borderLeft: `3px solid ${barColor}`,
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    textDecoration: "none",
                  }}
                >
                  <span className="t-label" style={{ fontSize: "var(--text-xs)", flex: "0 0 auto" }}>
                    {a.severity === "warn" ? "Action" : "Tip"}
                  </span>
                  <span style={{ flex: "1 1 auto" }}>{a.message}</span>
                  <span aria-hidden="true" style={{ flex: "0 0 auto" }}>→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
