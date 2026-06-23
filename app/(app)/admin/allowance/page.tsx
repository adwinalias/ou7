import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import AllowanceSection from "../_sections/AllowanceSection";

const dubaiYear = () => Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }).slice(0, 4));

// Thin wrapper around the reusable AllowanceSection (Epic 19.3b). Keeps the standalone
// /admin/allowance route working with its employee selector + ?employee= keying; the
// management UI itself lives in the shared section, reused inside the Employee-mode detail.
export default async function AllowanceAdminPage({ searchParams }: { searchParams: Promise<{ employee?: string; year?: string }> }) {
  await requireRole("HR");
  const sp = await searchParams;
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : dubaiYear();

  const employees = await db.employee.findMany({ orderBy: [{ status: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true } });
  const selectedId = sp.employee || employees[0]?.id;
  const employee = employees.find((e) => e.id === selectedId);

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Allowance management</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
        Adjustments and deductions are an audited ledger; the balance is computed by the engine. Reset recomputes the
        opening from the entitlement policy and leaves carry-over and adjustments untouched.
      </p>

      <form method="get" action="/admin/allowance" style={{ display: "flex", gap: "var(--space-3)", alignItems: "end", marginBottom: "var(--space-5)" }}>
        <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Employee
          <select name="employee" className="input" defaultValue={selectedId} data-testid="allowance-employee">
            {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
          </select>
        </label>
        <input type="hidden" name="year" value={year} />
        <button type="submit" className="btn btn-secondary">View</button>
      </form>

      {!employee ? <p className="t-muted">No employees.</p> : <AllowanceSection employeeId={employee.id} year={year} />}
    </div>
  );
}
