// Allowance-this-year widget (Epic 8; streamed per 21.2). Async server component that awaits
// ONLY its own data (the period balance + Remote holiday ledger), so a slow allowance query
// doesn't block the shell or the other widgets. Markup/testids unchanged from the old page.
import { donutSegments } from "@/core/allowance";
import AllowanceBreakdown from "@/components/AllowanceBreakdown";
import Donut from "../Donut";
import { cachedGetDashboard, cachedGetHolidayBalance, dubaiYear } from "./data";

export default async function AllowanceWidget({ employeeId }: { employeeId: string }) {
  const [{ balance }, holidayDays] = await Promise.all([
    cachedGetDashboard(employeeId),
    cachedGetHolidayBalance(employeeId, dubaiYear()),
  ]);
  const donut = balance
    ? donutSegments({ taken: balance.takenApproved, pending: balance.pending, available: balance.available })
    : null;

  return (
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
  );
}
