import { listEntitlementPolicies, listLeaveTypes } from "@/lib/config";
import { db } from "@/lib/db";
import {
  createDepartmentAction,
  createLeaveTypeAction,
  createTagAction,
  deletePolicyAction,
  setLeaveTypeActiveAction,
  upsertPolicyAction,
} from "../config/actions";

const ROLES = ["STAFF", "APPROVER", "HR"] as const;
const fieldCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };

// System-level configuration: entitlement policies (region × role), leave types,
// departments and tags. Data-fetching lives here so the section is self-contained and
// can be composed into the Admin console or rendered standalone at /admin/config.
export default async function ConfigSection() {
  const [policies, regions, departments, tags, leaveTypes] = await Promise.all([
    listEntitlementPolicies(),
    db.region.findMany({ orderBy: { name: "asc" } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    listLeaveTypes(),
  ]);

  return (
    <div>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Configuration</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
        Editable data — no deploy needed. Set the days each region and role is entitled to, the leave types people can
        request, and the departments and tags used to organise the team.
      </p>

      {/* Entitlement / carry-over policy */}
      <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-6)" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Entitlement &amp; carry-over policy (region × role)</div>
        <p className="t-muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>
          Annual days granted upfront (the engine pro-rates joiners) + carry-over cap/expiry. Enter your HR-approved numbers.
        </p>
        {policies.length === 0 ? (
          <p className="t-muted" style={{ marginBottom: "var(--space-4)" }} data-testid="policy-empty">No policies configured yet.</p>
        ) : (
          <div className="table-scroll" style={{ marginBottom: "var(--space-4)" }}>
            <table className="table" data-testid="policy-table">
              <thead><tr><th>Region</th><th>Role</th><th>Annual days</th><th>Carry-over cap</th><th>Expiry</th><th /></tr></thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td>{p.regionName}</td><td>{p.role}</td>
                    <td className="t-num">{p.annualDays}</td>
                    <td className="t-num">{p.carryOverCapDays ?? "—"}</td>
                    <td className="t-num">{p.carryOverExpiry ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deletePolicyAction}><input type="hidden" name="id" value={p.id} /><button className="btn btn-danger" style={{ padding: "2px 10px" }}>Delete</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={upsertPolicyAction} className="reflow-1col" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "var(--space-3)", alignItems: "end" }}>
          <label className="t-label" style={fieldCol}>Region
            <select name="regionId" className="input" required aria-required="true" data-testid="policy-region">
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="t-label" style={fieldCol}>Role
            <select name="role" className="input" data-testid="policy-role">{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          </label>
          <label className="t-label" style={fieldCol}>Annual days
            <input type="number" step="0.5" name="annualDays" required aria-required="true" className="input t-num" data-testid="policy-annual" />
          </label>
          <label className="t-label" style={fieldCol}>Carry-over cap
            <input type="number" step="0.5" name="carryOverCapDays" className="input t-num" placeholder="none" />
          </label>
          <label className="t-label" style={fieldCol}>Expiry (MM-DD)
            <input type="text" name="carryOverExpiry" className="input t-num" placeholder="03-31" />
          </label>
          <button type="submit" className="btn btn-primary" data-testid="save-policy">Save policy</button>
        </form>
      </section>

      {/* Leave types */}
      <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-6)" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Leave types</div>
        <div className="table-scroll" style={{ marginBottom: "var(--space-4)" }}>
          <table className="table" data-testid="leavetype-table">
            <thead><tr><th>Name</th><th>Code</th><th>Deducts</th><th>Status</th><th /></tr></thead>
            <tbody>
              {leaveTypes.map((lt) => (
                <tr key={lt.id}>
                  <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i aria-hidden style={{ width: 10, height: 10, background: lt.color }} />{lt.name}</span></td>
                  <td className="t-num">{lt.code}</td>
                  <td>{lt.deductsAllowance ? "Yes" : "No"}</td>
                  <td>{lt.active ? "Active" : "Retired"}</td>
                  <td style={{ textAlign: "right" }}>
                    <form action={setLeaveTypeActiveAction}>
                      <input type="hidden" name="id" value={lt.id} />
                      <input type="hidden" name="active" value={lt.active ? "false" : "true"} />
                      <button className="btn btn-secondary" style={{ padding: "2px 10px" }}>{lt.active ? "Retire" : "Reactivate"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={createLeaveTypeAction} className="reflow-1col" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: "var(--space-3)", alignItems: "end" }}>
          <label className="t-label" style={fieldCol}>Name<input name="name" required aria-required="true" className="input" data-testid="lt-name" /></label>
          <label className="t-label" style={fieldCol}>Code<input name="code" required aria-required="true" className="input t-num" maxLength={4} data-testid="lt-code" /></label>
          <label className="t-label" style={fieldCol}>Colour<input type="color" name="color" defaultValue="#2F6FEB" className="input" /></label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="deductsAllowance" defaultChecked /> Deducts</label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="paid" defaultChecked /> Paid</label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="noteRequired" /> Note req.</label>
          <button type="submit" className="btn btn-primary" data-testid="add-leavetype">Add type</button>
        </form>
      </section>

      {/* Departments + Tags */}
      <section className="card" style={{ padding: "var(--space-5)" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Departments &amp; tags</div>
        <div className="reflow-1col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-5)" }}>
          <div>
            <p className="t-muted" style={{ fontSize: "var(--text-sm)" }}>{departments.map((d) => d.name).join(", ") || "None"}</p>
            <form action={createDepartmentAction} style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              <input name="name" required aria-required="true" aria-label="New department name" className="input" placeholder="New department" data-testid="dept-name" />
              <button className="btn btn-primary" data-testid="add-dept">Add</button>
            </form>
          </div>
          <div>
            <p className="t-muted" style={{ fontSize: "var(--text-sm)" }}>{tags.map((t) => t.name).join(", ") || "None"}</p>
            <form action={createTagAction} style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
              <input name="name" required aria-required="true" aria-label="New tag name" className="input" placeholder="New tag" data-testid="tag-name" />
              <button className="btn btn-primary" data-testid="add-tag">Add</button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
