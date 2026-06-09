import { getOpenPeriodBalance } from "@/lib/allowance";
import { listAdjustments, previewReset } from "@/lib/allowance-admin";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { resetAction } from "./actions";
import AddEntryForm from "./AddEntryForm";

const num: React.CSSProperties = { textAlign: "right", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
const dubaiYear = () => Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }).slice(0, 4));

export default async function AllowanceAdminPage({ searchParams }: { searchParams: Promise<{ employee?: string; year?: string }> }) {
  await requireRole("HR");
  const sp = await searchParams;
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : dubaiYear();

  const employees = await db.employee.findMany({ orderBy: [{ status: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true } });
  const selectedId = sp.employee || employees[0]?.id;
  const employee = employees.find((e) => e.id === selectedId);

  const balance = employee ? await getOpenPeriodBalance(employee.id) : null;
  const ledger = balance ? await listAdjustments(balance.periodId) : [];
  const preview = employee ? await previewReset(employee.id, year) : null;

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

      {!employee ? (
        <p className="t-muted">No employees.</p>
      ) : !balance ? (
        <section className="card" style={{ padding: "var(--space-5)" }}>
          <p className="t-muted" style={{ marginBottom: "var(--space-4)" }}>This employee has no allowance period yet.</p>
          {preview?.hasPolicy ? (
            <form action={resetAction}>
              <input type="hidden" name="employeeId" value={employee.id} />
              <input type="hidden" name="year" value={year} />
              <p className="t-muted" style={{ marginBottom: "var(--space-3)" }}>Add balance for {year}: opening would be <strong className="t-num">{preview.proposedOpening}</strong> day(s).</p>
              <button className="btn btn-primary" data-testid="add-balance">Add balance</button>
            </form>
          ) : (
            <p style={{ color: "var(--danger)" }}>No entitlement policy configured for this region/role — set it under Configuration first.</p>
          )}
        </section>
      ) : (
        <>
          {/* Balance */}
          <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }} data-testid="allowance-balance">
            <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Balance ({year})</div>
            <table className="table">
              <tbody>
                <tr><td>Opening</td><td style={num} data-testid="bal-opening">{balance.opening}</td></tr>
                <tr><td>Taken (approved)</td><td style={num}>{balance.takenApproved}</td></tr>
                <tr><td>Pending</td><td style={num}>{balance.pending}</td></tr>
                <tr><td><strong>Remaining</strong></td><td style={num}><strong>{balance.remaining}</strong></td></tr>
                <tr><td><strong>Available</strong></td><td style={num}><strong>{balance.available}</strong></td></tr>
              </tbody>
            </table>
          </section>

          {/* Reset preview → confirm */}
          {preview?.hasPolicy && (
            <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
              <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Reset opening</div>
              <p className="t-muted" style={{ marginBottom: "var(--space-3)" }}>
                Opening <span className="t-num" data-testid="reset-from">{preview.currentOpening}</span> →
                <span className="t-num" data-testid="reset-to"> {preview.proposedOpening}</span> (annual {preview.annualDays}, pro-rated by joining date). Carry-over &amp; adjustments unchanged.
              </p>
              <form action={resetAction}>
                <input type="hidden" name="employeeId" value={employee.id} />
                <input type="hidden" name="year" value={year} />
                <button className="btn btn-primary" data-testid="reset-confirm">Apply reset</button>
              </form>
            </section>
          )}

          {/* Ledger + add entry */}
          <section className="card" style={{ padding: "var(--space-5)" }}>
            <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Adjustment ledger</div>
            {ledger.length === 0 ? (
              <p className="t-muted" style={{ marginBottom: "var(--space-4)" }}>No entries.</p>
            ) : (
              <table className="table" data-testid="ledger-table" style={{ marginBottom: "var(--space-4)" }}>
                <thead><tr><th>Date</th><th>Kind</th><th style={num}>Delta</th><th>Reason</th><th>By</th></tr></thead>
                <tbody>
                  {ledger.map((l) => (
                    <tr key={l.id}>
                      <td className="t-num">{l.createdAtISO}</td>
                      <td>{l.kind}</td>
                      <td style={num}>{l.delta}</td>
                      <td className="t-muted">{l.reason}</td>
                      <td className="t-muted">{l.actorName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <AddEntryForm periodId={balance.periodId} />
          </section>
        </>
      )}
    </div>
  );
}
