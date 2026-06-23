import AllowanceBreakdown from "@/components/AllowanceBreakdown";
import { getAllPeriodBalances, getOpenPeriodBalance, type YearPeriodBalance } from "@/lib/allowance";
import { listAdjustments, previewReset } from "@/lib/allowance-admin";
import { getHolidayBalance } from "@/lib/holiday-balance";
import { getEmployeeLeaveRecordsForYear, type YearLeaveRecord } from "@/lib/myleave";
import { resetAction, rolloverYearAction, setHolidayAction } from "../allowance/actions";
import AddEntryForm from "../allowance/AddEntryForm";

const num: React.CSSProperties = { textAlign: "right", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

// Year's leave records, drilled from a year's balance (Epic 24.2 / ADR-0013). Read-only;
// reuses the leave-type colour swatch + status pattern. Scrolls inside its own container.
function YearRecords({ year, records }: { year: number; records: YearLeaveRecord[] }) {
  return (
    <details style={{ marginTop: "var(--space-4)" }} data-testid={`year-records-${year}`}>
      <summary className="t-label" style={{ cursor: "pointer" }}>
        Leave records for {year} ({records.length})
      </summary>
      {records.length === 0 ? (
        <p className="t-muted" style={{ marginTop: "var(--space-3)" }}>No leave records for {year}.</p>
      ) : (
        <div className="table-scroll" style={{ marginTop: "var(--space-3)" }}>
          <table className="table" data-testid={`year-records-table-${year}`}>
            <thead><tr><th>Dates</th><th>Type</th><th style={num}>Days</th><th>Status</th></tr></thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="t-num">{r.fromISO === r.toISO ? r.fromISO : `${r.fromISO}→${r.toISO}`}</td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <i aria-hidden style={{ width: 10, height: 10, background: r.typeColor }} />
                      {r.typeName}
                    </span>
                  </td>
                  <td style={num}>{r.allowanceDays}</td>
                  <td className="t-muted">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

// A prior (closed) year's balance — READ-ONLY per ADR-0013 immutability. No edit controls;
// just the labelled breakdown + drill-in into that year's leave records.
async function PriorYearCard({ employeeId, period }: { employeeId: string; period: YearPeriodBalance }) {
  const records = await getEmployeeLeaveRecordsForYear(employeeId, period.year);
  return (
    <section className="card" style={{ padding: "var(--space-5)" }} data-testid={`year-card-${period.year}`}>
      <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Balance ({period.year}) · closed (read-only)</div>
      {/* Year-scoped row testids so the current card's canonical bd-* stay unique (24.2). */}
      <AllowanceBreakdown balance={period} testid={`bd-${period.year}`} rowPrefix={`bd-${period.year}`} />
      <YearRecords year={period.year} records={records} />
    </section>
  );
}

// Reusable allowance-management surface for one employee (Epic 9.2 / 19.3b AD6; 24.2 ADR-0013).
// Shows the CURRENT (open) year with full management controls and, alongside it, the PREVIOUS
// year READ-ONLY — without re-selecting — reflowing to one column ≤640px. HR can drill from
// either year's balance into that year's leave records. The engine math is reused unchanged
// (getOpenPeriodBalance / getAllPeriodBalances / computeRemaining). Callers (the
// /admin/allowance page and the Employee-mode detail) authorize HR server-side first.
export default async function AllowanceSection({ employeeId, year }: { employeeId: string; year: number }) {
  const balance = await getOpenPeriodBalance(employeeId);
  const ledger = balance ? await listAdjustments(balance.periodId) : [];
  const preview = await previewReset(employeeId, year);
  const holidayDays = await getHolidayBalance(employeeId, year); // null = non-Remote

  // Every period (newest first); the open one carries the current year, the next-newest is the
  // prior year shown alongside. If there is no prior period (new joiner), we show only current.
  const allPeriods = await getAllPeriodBalances(employeeId);
  const openPeriod = allPeriods.find((p) => p.endISO === null) ?? null;
  const currentYear = openPeriod?.year ?? year;
  const priorPeriod = allPeriods.find((p) => p.endISO !== null && p.year < currentYear) ?? null;

  // The records behind the CURRENT year's balance (drill-in beneath the management card).
  const currentRecords = balance ? await getEmployeeLeaveRecordsForYear(employeeId, currentYear) : [];

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
          {/* Current year alongside the previous year — reflows to one column ≤640px. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: priorPeriod ? "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" : "1fr",
              gap: "var(--space-5)",
              marginBottom: "var(--space-5)",
            }}
            data-testid="allowance-years"
          >
            {/* CURRENT (open) year — full management. Keeps the existing testid + breakdown. */}
            <section className="card" style={{ padding: "var(--space-5)" }} data-testid="allowance-balance">
              <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Balance ({currentYear}) · current</div>
              <AllowanceBreakdown balance={balance} />
              <YearRecords year={currentYear} records={currentRecords} />
            </section>

            {/* PREVIOUS year — read-only, shown without re-selecting. Omitted if none exists. */}
            {priorPeriod && <PriorYearCard employeeId={employeeId} period={priorPeriod} />}
          </div>

          {/* Year rollover (Epic 24.1) — HR-gated server-side; opens the next year's period. */}
          <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }} data-testid="rollover-section">
            <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Year rollover</div>
            <p className="t-muted" style={{ marginBottom: "var(--space-3)" }}>
              Close {currentYear} and open {currentYear + 1}, carrying over per the locked per-market policy.
              {" "}{currentYear} becomes read-only. No-op if {currentYear + 1} already exists.
            </p>
            <form action={rolloverYearAction}>
              <input type="hidden" name="employeeId" value={employeeId} />
              <input type="hidden" name="fromYear" value={currentYear} />
              <button className="btn btn-primary" data-testid="rollover-confirm">Roll over to {currentYear + 1}</button>
            </form>
          </section>

          {/* Reset preview → confirm (current period only) */}
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

          {/* Ledger + add entry (current period only) */}
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
