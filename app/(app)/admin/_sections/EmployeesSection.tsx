import { listEmployees } from "@/lib/employees";
import { db } from "@/lib/db";
import { createEmployeeAction, deactivateAction } from "../employees/actions";
import GenerateProfileButton from "../employees/GenerateProfileButton";
import ImportForm from "../employees/ImportForm";

const ROLES = ["STAFF", "APPROVER", "HR"] as const;
const LEVELS = ["NONE", "APPROVER", "APPROVER_ADD", "APPROVER_ADD_EDIT"] as const;
const fieldCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };

function dubaiYear() {
  return Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }).slice(0, 4));
}

// Employee-level settings: the staff list with activate/deactivate, add-employee and
// bulk-import. The per-employee detail view (inline edit, allowance, on-behalf) arrives
// in a later slice; for now the list is the surface.
export default async function EmployeesSection() {
  const [employees, regions, departments] = await Promise.all([
    listEmployees(),
    db.region.findMany({ orderBy: { name: "asc" } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  const year = dubaiYear();

  return (
    <div>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Employees</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
        Create and manage staff. Generating an allowance profile computes the opening from the configured entitlement
        policy (System settings → Configuration) and the joining date — it stops if no policy is set.
      </p>

      <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-6)" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Staff ({employees.length})</div>
        <p className="t-muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }} data-testid="employee-detail-hint">
          Select an employee to manage their record (coming in the employee detail view).
        </p>
        <div className="table-scroll">
          <table className="table" data-testid="employee-table">
            <thead><tr><th>Name</th><th>Email</th><th>Region</th><th>Role</th><th>Status</th><th>Allowance</th><th /></tr></thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td className="t-muted">{e.email}</td>
                  <td>{e.regionName}</td>
                  <td>{e.role}</td>
                  <td>{e.status === "ACTIVE" ? "Active" : "Inactive"}</td>
                  <td>{e.hasOpenPeriod ? <span className="t-muted">Profile set</span> : <GenerateProfileButton employeeId={e.id} year={year} />}</td>
                  <td style={{ textAlign: "right" }}>
                    {e.status === "ACTIVE" && (
                      <form action={deactivateAction}><input type="hidden" name="employeeId" value={e.id} /><button className="btn btn-danger" style={{ padding: "2px 10px" }}>Deactivate</button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-6)" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Add employee</div>
        <form action={createEmployeeAction} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "var(--space-3)", alignItems: "end" }}>
          <label className="t-label" style={fieldCol}>Email<input name="email" type="email" required className="input" data-testid="emp-email" /></label>
          <label className="t-label" style={fieldCol}>First name<input name="firstName" required className="input" data-testid="emp-first" /></label>
          <label className="t-label" style={fieldCol}>Last name<input name="lastName" required className="input" data-testid="emp-last" /></label>
          <label className="t-label" style={fieldCol}>Region
            <select name="regionId" className="input" required data-testid="emp-region">{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          </label>
          <label className="t-label" style={fieldCol}>Department
            <select name="departmentId" className="input"><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </label>
          <label className="t-label" style={fieldCol}>Joining date<input name="joiningISO" type="date" required className="input t-num" data-testid="emp-joining" /></label>
          <label className="t-label" style={fieldCol}>Role
            <select name="role" className="input" defaultValue="STAFF">{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          </label>
          <label className="t-label" style={fieldCol}>Approver level
            <select name="approverLevel" className="input" defaultValue="NONE">{LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</select>
          </label>
          <label className="t-label" style={fieldCol}>Type
            <select name="employmentType" className="input" defaultValue="FULL_TIME"><option value="FULL_TIME">Full-time</option><option value="FLEX">Flex</option></select>
          </label>
          <button type="submit" className="btn btn-primary" data-testid="emp-create">Create</button>
        </form>
      </section>

      <section className="card" style={{ padding: "var(--space-5)" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Bulk import</div>
        <ImportForm />
      </section>
    </div>
  );
}
