// "Upcoming holidays" widget (Epic 18.5; streamed per 21.2). Region-aware for the viewer;
// awaits only its own read. Markup/testids (upcoming-holidays-list / -empty / upcoming-holiday) kept.
import { cachedGetUpcomingHolidays } from "./data";
import { shortDate } from "./format";

export default async function UpcomingHolidaysWidget({ employeeId }: { employeeId: string }) {
  const upcomingHolidays = await cachedGetUpcomingHolidays(employeeId);
  return (
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
  );
}
