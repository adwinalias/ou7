import { listHRLogs } from "@/lib/hrlogs";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { deleteHRLogAction } from "./actions";
import HRLogForm from "./HRLogForm";

const TYPE_LABEL: Record<string, string> = { OOO: "Out of office", WFH: "Working from home", OTHER: "Other" };

export default async function HRLogsPage() {
  await requireRole("HR");
  const [logs, employees] = await Promise.all([
    listHRLogs(),
    db.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const empOptions = employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }));

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>HR logs (OOO / WFH)</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
        Private HR-only records. They never notify the employee.
      </p>

      <section className="card" style={{ padding: "var(--space-5)" }}>
        {logs.length === 0 ? (
          <p className="t-muted" style={{ marginBottom: "var(--space-4)" }}>No logs yet.</p>
        ) : (
          <div className="table-scroll" style={{ marginBottom: "var(--space-4)" }}>
            <table className="table" data-testid="hrlog-table">
              <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Notes</th><th /></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.employeeName}</td>
                    <td>{TYPE_LABEL[l.type]}</td>
                    <td className="t-num">{l.startISO}</td>
                    <td className="t-num">{l.endISO}</td>
                    <td className="t-muted">{l.notes ?? "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={deleteHRLogAction}><input type="hidden" name="id" value={l.id} /><button className="btn btn-danger" style={{ padding: "2px 10px" }}>Delete</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <HRLogForm employees={empOptions} />
      </section>
    </div>
  );
}
