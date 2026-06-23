import { listRestrictedDays } from "@/lib/calendars";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { createRestrictedAction, deleteRestrictedAction } from "./actions";

export default async function RestrictedDaysPage() {
  await requireRole("HR");
  const [rows, regions, departments] = await Promise.all([
    listRestrictedDays(),
    db.region.findMany({ orderBy: { name: "asc" } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Restricted / blackout days</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
        Periods when leave can&apos;t be booked. Enforced at request time for the matching company / region / department.
      </p>

      <section className="card" style={{ padding: "var(--space-5)" }}>
        {rows.length === 0 ? (
          <p className="t-muted" style={{ marginBottom: "var(--space-4)" }}>No restricted periods.</p>
        ) : (
          <div className="table-scroll" style={{ marginBottom: "var(--space-4)" }}>
            <table className="table" data-testid="restricted-table">
              <thead><tr><th>Scope</th><th>From</th><th>To</th><th>Reason</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.scopeLabel}</td>
                    <td className="t-num">{r.startISO}</td>
                    <td className="t-num">{r.endISO}</td>
                    <td className="t-muted">{r.reason ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deleteRestrictedAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="btn btn-danger" style={{ padding: "2px 10px" }}>Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form action={createRestrictedAction} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "var(--space-3)", alignItems: "end" }}>
          <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Scope
            <select name="scope" className="input" defaultValue="COMPANY" data-testid="r-scope">
              <option value="COMPANY">Company</option>
              <option value="REGION">Region</option>
              <option value="DEPARTMENT">Department</option>
            </select>
          </label>
          <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Region (if region scope)
            <select name="regionId" className="input">
              <option value="">—</option>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Department (if dept scope)
            <select name="departmentId" className="input">
              <option value="">—</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>From
            <input type="date" name="start" required className="input t-num" data-testid="r-start" />
          </label>
          <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>To
            <input type="date" name="end" required className="input t-num" data-testid="r-end" />
          </label>
          <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Reason
            <input type="text" name="reason" className="input" placeholder="e.g. Year-end freeze" data-testid="r-reason" />
          </label>
          <button type="submit" className="btn btn-primary" data-testid="add-restricted">Add</button>
        </form>
      </section>
    </div>
  );
}
