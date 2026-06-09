import { listCompanyPending } from "@/lib/approvals";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import CompanyQueue from "./CompanyQueue";

export default async function CompanyPendingPage({ searchParams }: { searchParams: Promise<{ name?: string; department?: string }> }) {
  await requireRole("HR");
  const sp = await searchParams;
  const [items, departments] = await Promise.all([
    listCompanyPending({ name: sp.name, departmentId: sp.department }),
    db.department.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Company pending queue</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-4)" }}>
        Every pending request org-wide, with time-in-pending. HR can approve or decline any of them.
      </p>

      <form method="get" action="/admin/pending" style={{ display: "flex", gap: "var(--space-3)", alignItems: "end", marginBottom: "var(--space-4)" }}>
        <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Name
          <input name="name" className="input" defaultValue={sp.name ?? ""} placeholder="Filter…" data-testid="q-name" />
        </label>
        <label className="t-label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>Department
          <select name="department" className="input" defaultValue={sp.department ?? ""} data-testid="q-dept">
            <option value="">All</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <button type="submit" className="btn btn-secondary">Filter</button>
      </form>

      <section className="card" style={{ padding: "var(--space-5)" }}>
        <CompanyQueue items={items} />
      </section>
    </div>
  );
}
