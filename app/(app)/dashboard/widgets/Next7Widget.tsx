// "My next 7 days" widget (Epic 8; streamed per 21.2). Awaits only the viewer's own next-7
// strip. Markup/testids (next-7, next7-key) unchanged from the old page.
import LeaveKey from "@/components/LeaveKey";
import { cachedGetDashboard } from "./data";
import { DayCell, weekdayInitial } from "./format";

export default async function Next7Widget({ employeeId }: { employeeId: string }) {
  const { days } = await cachedGetDashboard(employeeId);
  return (
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
  );
}
