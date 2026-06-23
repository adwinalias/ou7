import Link from "next/link";
import DashboardGrid, { type DashboardWidget } from "@/components/DashboardGrid";
import { isApprover } from "@/core/authz";
import { donutSegments } from "@/core/allowance";
import { countPendingForApprover } from "@/lib/approvals";
import { letterColorToken, type WallCell } from "@/core/wallchart";
import { getDashboard, getUpcomingHolidays } from "@/lib/dashboard";
import LeaveKey from "@/components/LeaveKey";
import { getHolidayBalance } from "@/lib/holiday-balance";
import { getWhosOff, type WhosOffData, type WhosOffEntryHR } from "@/lib/whosoff";
import { requireUser } from "@/lib/rbac";
import AllowanceBreakdown from "@/components/AllowanceBreakdown";
import Donut from "./Donut";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

/** Short, region-neutral day label, e.g. "Mon 23 Jun". */
function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// "Who's off" widget body (Epic 18.2). Glanceable list: one line per absentee with the
// PUBLIC four-category label (or, for HR, the real type), a pending/approved marker, region
// and the off window. The four-category abstraction is enforced server-side in
// lib/whosoff — non-HR entries never carry a raw type, so nothing to hide here.
function WhosOff({ data }: { data: WhosOffData }) {
  return (
    <>
      <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>Who&apos;s off</div>
      {data.entries.length === 0 ? (
        <p className="t-muted" data-testid="whosoff-empty">No one is off in the next {data.days} days.</p>
      ) : (
        <ul data-testid="whosoff-list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {data.entries.map((e, i) => {
            const pending = e.status === "PENDING";
            // HR sees the real type; everyone else sees only the abstracted category.
            const label = data.hr ? `${(e as WhosOffEntryHR).typeName}` : e.category;
            const range = e.startISO === e.endISO ? shortDate(e.startISO) : `${shortDate(e.startISO)} – ${shortDate(e.endISO)}`;
            return (
              <li
                key={`${e.employeeId}-${i}`}
                data-testid="whosoff-entry"
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  gap: "var(--space-2)",
                  // Pending = grey + coloured left bar (design system §2); approved = clear.
                  ...(pending
                    ? {
                        background: "var(--status-pending-bg)",
                        color: "var(--status-pending-fg)",
                        borderLeft: "3px solid var(--cell-lt, var(--border-strong))",
                        padding: "var(--space-2) var(--space-3)",
                      }
                    : { paddingBlock: "var(--space-1)" }),
                  // HR colours the left bar with the real type; non-HR stays neutral so no
                  // type signal leaks via colour.
                  ...(pending && data.hr ? { ["--cell-lt" as string]: (e as WhosOffEntryHR).color } : {}),
                }}
              >
                <span style={{ fontWeight: 600 }}>{e.name}</span>
                <span className="t-muted" style={{ fontSize: "var(--text-sm)" }}>
                  {label} · {e.regionName}
                </span>
                <span className="t-num" style={{ fontSize: "var(--text-xs)", marginLeft: "auto" }}>
                  {e.offToday ? "Today" : range}
                </span>
                {pending && (
                  <span className="pill pill-pending" style={{ fontSize: "var(--text-xs)" }}>Pending</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p style={{ marginTop: "var(--space-4)" }}>
        <Link className="btn btn-secondary" href="/wall-chart" data-testid="whosoff-calendar-link">View Team Calendar</Link>
      </p>
    </>
  );
}

function weekdayInitial(iso: string) {
  return WEEKDAY[new Date(`${iso}T00:00:00.000Z`).getUTCDay()];
}

function DayCell({ cell }: { cell: WallCell }) {
  const base: React.CSSProperties = {
    minHeight: 40,
    border: "1px solid var(--border)",
    display: "grid",
    placeItems: "center",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
    ...(cell.today ? { outline: "2px solid var(--accent)", outlineOffset: -2 } : {}),
  };
  if (cell.kind === "off") return <div className="cell--off" style={base} title="Non-working" aria-label="non-working" />;
  if (cell.kind === "none") return <div style={base} aria-label="available" />;
  const label = `${cell.half ? "½" : ""}${cell.code ?? ""}`;
  if (cell.kind === "approved") {
    const fg = letterColorToken(cell.color!) === "ink" ? "var(--ink)" : "var(--paper)";
    return <div style={{ ...base, background: cell.color, color: fg, fontWeight: 600 }} aria-label={`${cell.code} approved`}>{label}</div>;
  }
  return (
    <div className="cell--pending" style={{ ...base, ["--cell-lt" as string]: cell.color }} aria-label={`${cell.code} pending`}>
      {label}
    </div>
  );
}

export default async function DashboardPage() {
  const actor = await requireUser();
  const year = Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }).slice(0, 4));
  // Pending count only matters for approvers/HR; for everyone else the tile is omitted
  // entirely (AC2), so don't even query. countPendingForApprover shares its WHERE with
  // listPendingForApprover, so this number equals the /approvals queue exactly (AC1).
  const approver = isApprover(actor);
  const [{ balance, days }, holidayDays, whosOff, upcomingHolidays, pendingCount] = await Promise.all([
    getDashboard(actor.employeeId),
    getHolidayBalance(actor.employeeId, year), // null for non-Remote
    getWhosOff(actor), // company-wide; four-category abstraction enforced server-side
    getUpcomingHolidays(actor.employeeId), // region-aware for the viewer; next 5
    approver ? countPendingForApprover(actor) : Promise.resolve(0),
  ]);
  const donut = balance
    ? donutSegments({ taken: balance.takenApproved, pending: balance.pending, available: balance.available })
    : null;

  // Each tile's inner content is rendered on the server (RSC) and handed to the
  // DashboardGrid client component as props — server-rendered nodes as props to a
  // client component is allowed. The tile content/data is UNCHANGED from Epic 8;
  // only the surrounding .card wrapper + grid now live in DashboardGrid.
  // The array order is the DEFAULT layout for new users; DashboardGrid is
  // id-keyed so adding widgets later (Epic 18.2+) is just a new entry here.
  const widgets: DashboardWidget[] = [
    {
      id: "allowance",
      title: "Allowance this year",
      content: (
        <>
          <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>Allowance this year</div>
          {donut && balance ? (
            <>
              <Donut segments={donut.segments} total={donut.total} available={balance.available} />
              <div style={{ marginTop: "var(--space-4)" }}>
                <AllowanceBreakdown balance={balance} testid="dash-allowance-breakdown" />
              </div>
            </>
          ) : (
            <p className="t-muted">No allowance period yet — contact HR.</p>
          )}
          {holidayDays !== null && (
            <p className="t-muted" style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }} data-testid="dash-holiday">
              Holiday (Remote): <span className="t-num">{holidayDays}</span> day(s)
            </p>
          )}
        </>
      ),
    },
    {
      id: "next7",
      title: "My next 7 days",
      content: (
        <>
          <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>My next 7 days</div>
          <div className="next7-grid" data-testid="next-7" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {days.map((cell) => (
              <div key={cell.iso} style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "center" }}>
                <span className="t-muted" style={{ fontSize: "var(--text-xs)" }}>{weekdayInitial(cell.iso)}</span>
                <DayCell cell={cell} />
                <span className="t-num" style={{ fontSize: "var(--text-xs)", fontWeight: cell.today ? 700 : 400 }}>{cell.day}</span>
              </div>
            ))}
          </div>
          {/* DB2/M2: the shared drawn-swatch key replaces the old "Hatched = non-working" text.
              mode="categories" draws the four category swatches (incl. National Holiday) plus
              the Pending and Weekend / non-working swatches the key already owns. */}
          <div style={{ marginTop: "var(--space-4)" }}>
            <LeaveKey mode="categories" testid="next7-key" />
          </div>
        </>
      ),
    },
    {
      id: "upcoming-holidays",
      title: "Upcoming holidays",
      content: (
        <>
          <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>Upcoming holidays</div>
          {upcomingHolidays.length === 0 ? (
            <p className="t-muted" data-testid="upcoming-holidays-empty">No upcoming holidays.</p>
          ) : (
            <ul
              data-testid="upcoming-holidays-list"
              style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
            >
              {upcomingHolidays.map((h) => (
                <li
                  key={h.dateISO}
                  data-testid="upcoming-holiday"
                  style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "var(--space-2)", paddingBlock: "var(--space-1)" }}
                >
                  <span style={{ fontWeight: 600 }}>{h.name}</span>
                  <span className="t-num" style={{ fontSize: "var(--text-sm)", marginLeft: "auto" }}>{shortDate(h.dateISO)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    },
    {
      id: "whosoff",
      title: "Who's off",
      content: <WhosOff data={whosOff} />,
    },
    // Epic 18.7: the full-column "Request leave" tile was removed — the Request flow is
    // now reachable from the persistent side-peek action in the app-shell header
    // (RequestPeek), reclaiming the dashboard column. The /request route still works as a
    // deep-link fallback.
  ];

  // Role-aware "Pending approvals (N)" tile (Epic 18.3) — present in the registry ONLY for
  // approvers/HR; non-approvers never get the widget at all (AC2). Deep-links to /approvals.
  if (approver) {
    widgets.push({
      id: "pending-approvals",
      title: "Pending approvals",
      content: (
        <>
          <div className="t-label">Pending approvals</div>
          <p
            className="t-muted"
            style={{ marginTop: 8, marginBottom: "var(--space-4)", fontSize: "var(--text-sm)" }}
            data-testid="dash-pending-count"
          >
            {pendingCount === 0 ? (
              "No requests are waiting for you."
            ) : (
              <>
                <span className="t-num">{pendingCount}</span> request{pendingCount === 1 ? "" : "s"}{" "}
                {pendingCount === 1 ? "is" : "are"} waiting for your decision.
              </>
            )}
          </p>
          <Link
            className="btn btn-secondary"
            href="/approvals"
            data-testid="dash-pending-link"
            style={{ minHeight: 40, display: "inline-flex", alignItems: "center" }}
          >
            {pendingCount === 0 ? "No pending approvals" : `Pending approvals (${pendingCount})`}
          </Link>
        </>
      ),
    });
  }

  return (
    <div>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-5)" }}>My Dashboard</h1>
      <DashboardGrid widgets={widgets} />
    </div>
  );
}
