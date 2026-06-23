import { getAuditEvents } from "@/lib/audit";
import { requireRole } from "@/lib/rbac";

const num: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

function dubai(d: Date) {
  return d.toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
}

function compact(v: unknown) {
  if (v === null || v === undefined) return "—";
  return JSON.stringify(v);
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireRole("HR"); // HR-only viewer
  const sp = await searchParams;
  const data = await getAuditEvents({ page: sp.page ? Number(sp.page) : 1 });

  return (
    <div>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Audit log</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
        Immutable record of admin and approval actions — who, what, when, and before → after.
      </p>

      {data.total === 0 ? (
        <p className="t-editorial" style={{ fontSize: "var(--text-h2)" }}>No activity recorded yet.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="table" data-testid="audit-table">
              <thead>
                <tr>
                  <th>When (Dubai)</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Before → After</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td style={num}>{dubai(r.createdAt)}</td>
                    <td>{r.actorName}</td>
                    <td><span className="t-label">{r.action}</span></td>
                    <td className="t-muted">{r.entity}{r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}</td>
                    <td className="t-muted" style={{ fontSize: "var(--text-sm)", maxWidth: 360, overflowWrap: "anywhere" }}>
                      {compact(r.before)} → {compact(r.after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
            {data.page > 1
              ? <a className="btn btn-secondary" href={`/admin/audit?page=${data.page - 1}`}>← Prev</a>
              : <span className="btn btn-secondary" aria-disabled style={{ opacity: 0.45 }}>← Prev</span>}
            <span className="t-muted">Page {data.page} of {data.pageCount}</span>
            {data.page < data.pageCount
              ? <a className="btn btn-secondary" href={`/admin/audit?page=${data.page + 1}`}>Next →</a>
              : <span className="btn btn-secondary" aria-disabled style={{ opacity: 0.45 }}>Next →</span>}
          </div>
        </>
      )}
    </div>
  );
}
