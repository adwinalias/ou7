import { findDayCountDiscrepancies } from "@/lib/integrity";

// Story 30.3 — Day-count integrity check (ADR-0015). READ-ONLY.
// Lists any PENDING/APPROVED booking whose stored snapshot differs from a fresh
// recompute against the region effective on its dates. HR/admin diagnostics only;
// no action buttons, no auto-fix controls.
export default async function DayCountIntegritySection() {
  const rows = await findDayCountDiscrepancies();

  return (
    <div>
      <h2 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Day-count integrity</h2>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
        Read-only. Flags any pending or approved booking whose stored day-count snapshot
        differs from a fresh recompute against the region effective on its dates (e.g. after
        a WhosOff import or a region backfill). The stored snapshot is authoritative — this
        is for HR awareness only. No changes are made here.
      </p>

      <section className="card" style={{ padding: "var(--space-5)" }}>
        {rows.length === 0 ? (
          <p className="t-muted" data-testid="integrity-empty">No day-count discrepancies.</p>
        ) : (
          <div className="table-scroll">
            <table className="table" data-testid="integrity-table">
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Stored (wd / fd / alw)</th>
                  <th scope="col">Recomputed (wd / fd / alw)</th>
                  <th scope="col">Effective region</th>
                  <th scope="col">Explanation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.requestId}>
                    <td>{r.employeeName}</td>
                    <td className="t-num" style={{ whiteSpace: "nowrap" }}>
                      {r.startISO === r.endISO ? r.startISO : `${r.startISO} – ${r.endISO}`}
                    </td>
                    <td className="t-num" style={{ whiteSpace: "nowrap" }}>
                      {r.stored.workingDays} / {r.stored.freeDays} / {r.stored.allowanceDays}
                    </td>
                    <td
                      className="t-num"
                      style={{ whiteSpace: "nowrap", color: "var(--danger)" }}
                      aria-label={`Recomputed: ${r.recomputed.workingDays} working, ${r.recomputed.freeDays} free, ${r.recomputed.allowanceDays} allowance`}
                    >
                      {r.recomputed.workingDays} / {r.recomputed.freeDays} / {r.recomputed.allowanceDays}
                    </td>
                    <td>{r.effectiveRegionName}</td>
                    <td className="t-muted" style={{ fontSize: "var(--text-sm)" }}>
                      {r.explanation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
