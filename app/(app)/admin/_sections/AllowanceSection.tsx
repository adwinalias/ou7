import AllowanceBreakdown from "@/components/AllowanceBreakdown";
import { getOpenPeriodBalance } from "@/lib/allowance";
import { listAdjustments, previewReset } from "@/lib/allowance-admin";
import { getHolidayBalance } from "@/lib/holiday-balance";
import { resetAction, setHolidayAction } from "../allowance/actions";
import AddEntryForm from "../allowance/AddEntryForm";

const num: React.CSSProperties = { textAlign: "right", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

// Reusable allowance-management surface for one employee + year (Epic 9.2 / 19.3b AD6).
// Fetches balance/adjustments/reset-preview/holiday and renders the labelled breakdown,
// the Remote holiday ledger, the reset-opening preview→confirm, and the adjustment ledger
// + add-entry form — reusing the existing server actions and testids. Callers (the
// /admin/allowance page and the Employee-mode detail) authorize HR server-side first.
export default async function AllowanceSection({ employeeId, year }: { employeeId: string; year: number }) {
  const balance = await getOpenPeriodBalance(employeeId);
  const ledger = balance ? await listAdjustments(balance.periodId) : [];
  const preview = await previewReset(employeeId, year);
  const holidayDays = await getHolidayBalance(employeeId, year); // null = non-Remote

  return (
    <>
      {/* Remote-only Holiday allowance (v2b) — separate non-carry ledger */}
      {holidayDays !== null && (
        <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }} data-testid="holiday-section">
          <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Holiday allowance · Remote ({year})</div>
          <p className="t-muted" style={{ marginBottom: "var(--space-3)" }}>
            Separate from annual leave; non-carry (lapses at year-end). Remaining{" "}
            <strong className="t-num" data-testid="holiday-days">{holidayDays}</strong> day(s).
          </p>
          <form action={setHolidayAction} style={{ display: "flex", gap: "var(--space-2)", alignItems: "end" }}>
            <input type="hidden" name="employeeId" value={employeeId} />
            <input type="hidden" name="year" value={year} />
            <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Set days
              <input type="number" step="0.5" min="0" name="days" defaultValue={holidayDays} className="input t-num" data-testid="holiday-input" />
            </label>
            <button type="submit" className="btn btn-primary" data-testid="holiday-save">Save</button>
          </form>
        </section>
      )}

      {!balance ? (
        <section className="card" style={{ padding: "var(--space-5)" }}>
          <p className="t-muted" style={{ marginBottom: "var(--space-4)" }}>This employee has no allowance period yet.</p>
          {preview?.hasPolicy ? (
            <form action={resetAction}>
              <input type="hidden" name="employeeId" value={employeeId} />
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
          {/* Balance — shared labelled breakdown (Epic 18.4; H4/AD9) */}
          <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }} data-testid="allowance-balance">
            <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Balance ({year})</div>
            <AllowanceBreakdown balance={balance} />
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
                <input type="hidden" name="employeeId" value={employeeId} />
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
              <div className="table-scroll" style={{ marginBottom: "var(--space-4)" }}>
                <table className="table" data-testid="ledger-table">
                  <thead><tr><th>Date</th><th>Kind</th><th>Bucket</th><th style={num}>Delta</th><th>Reason</th><th>By</th></tr></thead>
                  <tbody>
                    {ledger.map((l) => (
                      <tr key={l.id}>
                        <td className="t-num">{l.createdAtISO}</td>
                        <td>{l.kind}</td>
                        <td>{l.bucket === "PUBLIC_HOLIDAY" ? "Public holiday" : "Vacation"}</td>
                        <td style={num}>{l.delta}</td>
                        <td className="t-muted">{l.reason}</td>
                        <td className="t-muted">{l.actorName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <AddEntryForm periodId={balance.periodId} />
          </section>
        </>
      )}
    </>
  );
}
