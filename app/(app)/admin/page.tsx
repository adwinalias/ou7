import { requireRole } from "@/lib/rbac";

export default async function AdminPage() {
  // HR-only (Epic 9). Defense in depth: the nav already hides this for non-HR, but the
  // guard re-checks server-side and redirects anyone else away.
  await requireRole("HR");

  return (
    <div>
      <h1 className="t-h1">Admin (HR)</h1>
      <p className="t-muted" style={{ marginTop: 12 }}>
        Employees, allowances (Reset/Add Balance), leave types, departments/regions/tags, public holidays, approval
        routing, branding, reports, Notion export. HR-only. See EPIC 9.
      </p>
    </div>
  );
}
