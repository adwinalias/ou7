import { db } from "@/lib/db";
import { listStaffRestrictions } from "@/lib/restrictions";
import {
  createStaffRestrictionAction,
  deleteStaffRestrictionAction,
} from "../staff-restrictions/actions";

// Staff-restriction pairs (story 29.1 / ADR-0014).
// Two employees who should not be off at the same time.
// Enforcement (clash detection) is story 29.2 — this section is model + CRUD only.
export default async function StaffRestrictionsSection() {
  const [rows, employees] = await Promise.all([
    listStaffRestrictions(),
    db.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
        <h1 className="t-h1" style={{ margin: 0 }}>Staff restrictions</h1>
        <a
          href="/admin/staff-restrictions/export"
          className="btn btn-secondary"
          style={{ marginLeft: "auto" }}
          aria-label="Export staff restrictions as CSV"
        >
          Export CSV
        </a>
      </div>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
        Pairs of employees who should not be off at the same time. Clash detection at request time is story 29.2.
      </p>

      <section className="card" style={{ padding: "var(--space-5)" }}>
        {rows.length === 0 ? (
          <p className="t-muted" style={{ marginBottom: "var(--space-4)" }}>No staff restrictions configured.</p>
        ) : (
          <div className="table-scroll" style={{ marginBottom: "var(--space-4)" }}>
            <table className="table" data-testid="staff-restriction-table">
              <thead>
                <tr>
                  <th>Person A</th>
                  <th>Person B</th>
                  <th>Both ways?</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.employeeAName}</td>
                    <td>{r.employeeBName}</td>
                    <td>{r.bidirectional ? "Yes" : "No"}</td>
                    <td className="t-muted">{r.reason ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deleteStaffRestrictionAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="btn btn-danger"
                          style={{ padding: "2px 10px" }}
                          aria-label={`Remove restriction between ${r.employeeAName} and ${r.employeeBName}`}
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form
          action={createStaffRestrictionAction}
          data-testid="add-restriction"
          className="reflow-1col"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
            gap: "var(--space-3)",
            alignItems: "end",
          }}
        >
          <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            Person A
            <select name="employeeAId" className="input" required aria-required="true" data-testid="sr-employeeA">
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
          </label>
          <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            Person B
            <select name="employeeBId" className="input" required aria-required="true" data-testid="sr-employeeB">
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </select>
          </label>
          <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            Reason
            <input
              type="text"
              name="reason"
              className="input"
              placeholder="e.g. Same role"
              data-testid="sr-reason"
            />
          </label>
          <label
            className="t-label"
            style={{ display: "flex", flexDirection: "row", gap: "var(--space-2)", alignItems: "center" }}
          >
            <input
              type="checkbox"
              name="bidirectional"
              defaultChecked
              style={{ width: 18, height: 18, minWidth: 18 }}
              data-testid="sr-bidirectional"
            />
            Both ways
          </label>
          <button type="submit" className="btn btn-primary" data-testid="submit-restriction">
            Add restriction
          </button>
        </form>
      </section>
    </div>
  );
}
