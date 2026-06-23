import { listHolidays } from "@/lib/calendars";
import { db } from "@/lib/db";
import { cloneHolidaysAction, createHolidayAction, deleteHolidayAction, updateWeekendsAction } from "../calendars/actions";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dubaiYear() {
  return Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }).slice(0, 4));
}

// Regional calendars: per-region weekend days and public holidays. The region/year
// selectors are GET-driven; `formAction` controls where they post (the standalone
// /admin/calendars page vs. the /admin console, where `mode=system` is preserved).
export default async function CalendarsSection({
  regionId,
  yearStr,
  formAction = "/admin/calendars",
  preserveMode = false,
}: {
  regionId?: string;
  yearStr?: string;
  formAction?: string;
  preserveMode?: boolean;
}) {
  const regions = await db.region.findMany({ orderBy: { name: "asc" } });
  const region = regions.find((r) => r.id === regionId) ?? regions[0];
  const year = yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : dubaiYear();
  const holidays = region ? await listHolidays(region.id, year) : [];
  const years = [year - 1, year, year + 1, year + 2];

  if (!region) return <p className="t-muted">No regions configured.</p>;

  return (
    <div>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Regional calendars</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>Weekends and public holidays per region. These feed day-counting and the wall chart.</p>

      {/* Region + year selectors */}
      <form method="get" action={formAction} style={{ display: "flex", gap: "var(--space-3)", alignItems: "end", marginBottom: "var(--space-5)" }}>
        {preserveMode && <input type="hidden" name="mode" value="system" />}
        <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Region
          <select name="region" className="input" defaultValue={region.id} data-testid="region-select">
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Year
          <select name="year" className="input" defaultValue={year}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary">View</button>
      </form>

      {/* Weekends */}
      <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Weekend days — {region.name}</div>
        <form action={updateWeekendsAction} style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
          <input type="hidden" name="regionId" value={region.id} />
          {WEEKDAYS.map((label, d) => (
            <label key={d} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" name={`wd-${d}`} defaultChecked={region.weekendDays.includes(d)} /> {label}
            </label>
          ))}
          <button type="submit" className="btn btn-primary">Save weekends</button>
        </form>
      </section>

      {/* Holidays */}
      <section className="card" style={{ padding: "var(--space-5)" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Public holidays — {region.name} {year}</div>

        {holidays.length === 0 ? (
          <p className="t-muted" style={{ marginBottom: "var(--space-4)" }}>No holidays entered for {year}.</p>
        ) : (
          <div className="table-scroll" style={{ marginBottom: "var(--space-4)" }}>
            <table className="table" data-testid="holiday-table">
              <thead><tr><th>Date</th><th>Name</th><th /></tr></thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id}>
                    <td className="t-num">{h.dateISO}</td>
                    <td>{h.name}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deleteHolidayAction}>
                        <input type="hidden" name="id" value={h.id} />
                        <button type="submit" className="btn btn-danger" style={{ padding: "2px 10px" }}>Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={createHolidayAction} style={{ display: "flex", gap: "var(--space-3)", alignItems: "end", flexWrap: "wrap" }}>
          <input type="hidden" name="regionId" value={region.id} />
          <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Date
            <input type="date" name="date" required aria-required="true" className="input t-num" defaultValue={`${year}-01-01`} data-testid="holiday-date" />
          </label>
          <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 200px" }}>Name
            <input type="text" name="name" required aria-required="true" className="input" placeholder="e.g. National Day" data-testid="holiday-name" />
          </label>
          <button type="submit" className="btn btn-primary" data-testid="add-holiday">Add holiday</button>
        </form>

        <form action={cloneHolidaysAction} style={{ marginTop: "var(--space-4)" }}>
          <input type="hidden" name="regionId" value={region.id} />
          <input type="hidden" name="fromYear" value={year - 1} />
          <button type="submit" className="btn btn-secondary" data-testid="clone-holidays">Clone {year - 1} → {year}</button>
        </form>
      </section>
    </div>
  );
}
