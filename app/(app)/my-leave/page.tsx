import AllowanceBreakdown from "@/components/AllowanceBreakdown";
import { isHR } from "@/core/authz";
import { canCancel } from "@/core/cancellation";
import { getAllPeriodBalances } from "@/lib/allowance";
import { getMyApprovers } from "@/lib/approvals";
import { getHolidayBalance } from "@/lib/holiday-balance";
import { getLeaveHistory, type HistoryFilters, type HistoryRow } from "@/lib/myleave";
import { requireUser } from "@/lib/rbac";
import { cancelOwnAction, remindOwnAction } from "./actions";

function dubaiToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

const STATUS_PILL: Record<string, string> = {
  PENDING: "pill pill-pending",
  APPROVED: "pill pill-approved",
  DECLINED: "pill pill-declined",
  CANCELLED: "pill pill-cancelled",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", DECLINED: "Declined", CANCELLED: "Cancelled" };

function qs(f: { from: string; to: string; decision: string; type: string }, page: number) {
  const p = new URLSearchParams();
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.decision) p.set("decision", f.decision);
  if (f.type) p.set("type", f.type);
  p.set("page", String(page));
  return `/my-leave?${p.toString()}`;
}

const num: React.CSSProperties = { textAlign: "right", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

export default async function MyLeavePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; decision?: string; type?: string; page?: string }>;
}) {
  const actor = await requireUser();
  const sp = await searchParams;

  const filters: HistoryFilters = {
    from: sp.from,
    to: sp.to,
    decision: sp.decision,
    type: sp.type,
    page: sp.page ? Number(sp.page) : 1,
  };
  const todayISO = dubaiToday();
  const year = Number(todayISO.slice(0, 4));
  const [periods, history, holidayDays, approvers] = await Promise.all([
    getAllPeriodBalances(actor.employeeId),
    getLeaveHistory(actor.employeeId, filters),
    getHolidayBalance(actor.employeeId, year), // null for non-Remote
    getMyApprovers(actor.employeeId),
  ]);
  const f = history.filters;
  const hr = isHR(actor);
  const currentPeriod = periods.find((p) => p.endISO === null);
  const rowCanCancel = (r: HistoryRow) => canCancel({ status: r.status, isOwner: true, isHR: hr, todayISO, startISO: r.fromISO }).allowed;

  return (
    <div>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>My leave</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>Your allowance and leave history.</p>

      {/* 19.8 — allowance + "My approvers" side-by-side (reflows to one column ≤640px). */}
      <div
        className="reflow-1col"
        style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--space-5)", alignItems: "start", marginBottom: "var(--space-6)" }}
      >
        {/* 7.3 — allowance panel (per year); slimmed so it shares the row (Epic 19.8). */}
        <section className="card" style={{ padding: "var(--space-5)" }}>
          <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>Allowance</div>
          {periods.length === 0 ? (
            <p className="t-muted">No allowance period yet — contact HR.</p>
          ) : (
            <>
            {/* Current (open) period — shared labelled breakdown (Epic 18.4; H4/AD9). */}
            {currentPeriod && (
              <div style={{ marginBottom: "var(--space-5)" }}>
                <AllowanceBreakdown balance={currentPeriod} testid="my-leave-breakdown" />
              </div>
            )}
            {/* Prior years kept for multi-year visibility (Epic 7.3). */}
            <div className="table-scroll">
              <table className="table" data-testid="allowance-panel">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th style={num}>Opening</th>
                    <th style={num}>Remaining</th>
                    <th style={num}>Pending</th>
                    <th style={num}>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.periodId}>
                      <td className="t-num">{p.year}{p.endISO ? "" : " (current)"}</td>
                      <td style={num}>{p.opening}</td>
                      <td style={num}>{p.remaining}</td>
                      <td style={num}>{p.pending}</td>
                      <td style={num}>{p.available}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
          {holidayDays !== null && (
            <p className="t-muted" style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }} data-testid="holiday-balance">
              Holiday allowance (Remote, {year}): <strong className="t-num">{holidayDays}</strong> day(s) — separate, non-carry.
            </p>
          )}
        </section>

        {/* 19.8 — My approvers: the approval chain in level order (ML4). */}
        <section className="card" style={{ padding: "var(--space-5)" }} aria-labelledby="my-approvers-label" data-testid="my-approvers">
          <div id="my-approvers-label" className="t-label" style={{ marginBottom: "var(--space-4)" }}>My approvers</div>
          {approvers.length === 0 ? (
            <p className="t-muted">No approvers assigned.</p>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {approvers.map((a) => (
                <li key={a.level} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="t-label">Level {a.level}</span>
                  <span>{a.name}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* 7.1 — history list */}
      <section className="card" style={{ padding: "var(--space-5)" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>History</div>

        <form method="get" action="/my-leave" style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "end", marginBottom: "var(--space-4)" }}>
          <Field label="From" htmlFor="from"><input id="from" name="from" type="date" className="input t-num" defaultValue={f.from} /></Field>
          <Field label="To" htmlFor="to"><input id="to" name="to" type="date" className="input t-num" defaultValue={f.to} /></Field>
          <Field label="Decision" htmlFor="decision">
            <select id="decision" name="decision" className="input" defaultValue={f.decision} data-testid="filter-decision">
              <option value="">All</option>
              {Object.keys(STATUS_LABEL).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Type" htmlFor="type">
            <select id="type" name="type" className="input" defaultValue={f.type} data-testid="filter-type">
              <option value="">All</option>
              {history.types.map((t) => (
                <option key={t.code} value={t.code}>{t.name}</option>
              ))}
            </select>
          </Field>
          <button type="submit" className="btn btn-primary">Filter</button>
        </form>

        {history.total === 0 ? (
          <p className="t-editorial" style={{ fontSize: "var(--text-h2)" }}>No leave booked yet.</p>
        ) : (
          <>
            <div className="table-scroll">
            <table className="table" data-testid="history-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Duration</th>
                  <th style={num}>Free</th>
                  <th style={num}>Working</th>
                  <th style={num}>Allowance</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Options</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map((r) => (
                  <tr key={r.id} title={r.notes ?? undefined}>
                    <td className="t-num">{r.fromISO}</td>
                    <td className="t-num">{r.toISO}</td>
                    <td>{r.duration}</td>
                    <td style={num}>{r.freeDays}</td>
                    <td style={num}>{r.workingDays}</td>
                    <td style={num}>{r.allowanceDays}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <i aria-hidden style={{ width: 10, height: 10, background: r.typeColor, display: "inline-block" }} />
                        {r.typeName}
                      </span>
                    </td>
                    <td><span className={STATUS_PILL[r.status]}>{STATUS_LABEL[r.status]}</span></td>
                    <td>
                      <div style={{ display: "flex", gap: "var(--space-2)" }}>
                        {rowCanCancel(r) && (
                          <form action={cancelOwnAction}>
                            <input type="hidden" name="requestId" value={r.id} />
                            <button type="submit" className="btn btn-danger" style={{ padding: "2px 10px" }} data-testid="row-cancel">Cancel</button>
                          </form>
                        )}
                        {r.status === "PENDING" && (
                          <form action={remindOwnAction}>
                            <input type="hidden" name="requestId" value={r.id} />
                            <button type="submit" className="btn btn-secondary" style={{ padding: "2px 10px" }} data-testid="row-remind">Remind</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="t-label">Totals ({history.total})</td>
                  <td style={num} className="t-num">{history.totals.freeDays}</td>
                  <td style={num} className="t-num">{history.totals.workingDays}</td>
                  <td style={num} className="t-num">{history.totals.allowanceDays}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
            </div>

            {/* Pagination */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
              {history.page > 1
                ? <a className="btn btn-secondary" href={qs(f, history.page - 1)} data-testid="page-prev">← Prev</a>
                : <span className="btn btn-secondary" aria-disabled style={{ opacity: 0.45 }}>← Prev</span>}
              <span className="t-muted" data-testid="page-label">Page {history.page} of {history.pageCount}</span>
              {history.page < history.pageCount
                ? <a className="btn btn-secondary" href={qs(f, history.page + 1)} data-testid="page-next">Next →</a>
                : <span className="btn btn-secondary" aria-disabled style={{ opacity: 0.45 }}>Next →</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <label htmlFor={htmlFor} className="t-label">{label}</label>
      {children}
    </div>
  );
}
