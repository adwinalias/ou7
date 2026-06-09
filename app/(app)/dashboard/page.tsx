import Link from "next/link";
import { donutSegments } from "@/core/allowance";
import { letterColorToken, type WallCell } from "@/core/wallchart";
import { getDashboard } from "@/lib/dashboard";
import { getHolidayBalance } from "@/lib/holiday-balance";
import { requireUser } from "@/lib/rbac";
import Donut from "./Donut";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

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
  const [{ balance, days }, holidayDays] = await Promise.all([
    getDashboard(actor.employeeId),
    getHolidayBalance(actor.employeeId, year), // null for non-Remote
  ]);
  const donut = balance
    ? donutSegments({ taken: balance.takenApproved, pending: balance.pending, available: balance.available })
    : null;

  return (
    <div>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-5)" }}>Dashboard</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "var(--space-4)" }}>
        {/* 8.1 — allowances donut */}
        <section className="card" style={{ padding: "var(--space-5)" }}>
          <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>Allowance this year</div>
          {donut && balance ? (
            <>
              <Donut segments={donut.segments} total={donut.total} available={balance.available} />
              <p className="t-muted" style={{ marginTop: "var(--space-4)", fontSize: "var(--text-sm)" }}>
                Opening <span className="t-num">{balance.opening}</span> · Remaining <span className="t-num">{balance.remaining}</span>
              </p>
            </>
          ) : (
            <p className="t-muted">No allowance period yet — contact HR.</p>
          )}
          {holidayDays !== null && (
            <p className="t-muted" style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }} data-testid="dash-holiday">
              Holiday (Remote): <span className="t-num">{holidayDays}</span> day(s)
            </p>
          )}
        </section>

        {/* 8.2 — next 7 days */}
        <section className="card" style={{ padding: "var(--space-5)" }}>
          <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>My next 7 days</div>
          <div data-testid="next-7" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {days.map((cell) => (
              <div key={cell.iso} style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "center" }}>
                <span className="t-muted" style={{ fontSize: "var(--text-xs)" }}>{weekdayInitial(cell.iso)}</span>
                <DayCell cell={cell} />
                <span className="t-num" style={{ fontSize: "var(--text-xs)", fontWeight: cell.today ? 700 : 400 }}>{cell.day}</span>
              </div>
            ))}
          </div>
          <p className="t-muted" style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>
            Hatched = non-working (weekend/holiday or your work pattern).
          </p>
        </section>

        {/* 8.3 — request-leave widget */}
        <section className="card" style={{ padding: "var(--space-5)" }}>
          <div className="t-label">Request leave</div>
          <p className="t-muted" style={{ marginTop: 8, marginBottom: "var(--space-4)" }}>Book time off in a couple of clicks.</p>
          <Link className="btn btn-primary" href="/request" data-testid="dash-request">Request leave</Link>
        </section>
      </div>
    </div>
  );
}
