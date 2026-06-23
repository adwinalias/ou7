import { requireRole } from "@/lib/rbac";
import CalendarsSection from "./_sections/CalendarsSection";
import ConfigSection from "./_sections/ConfigSection";
import EmployeesSection from "./_sections/EmployeesSection";
import RestrictedDaysSection from "./_sections/RestrictedDaysSection";

type Mode = "system" | "employee";

const segBase: React.CSSProperties = {
  flex: "1 1 0",
  textAlign: "center",
  padding: "var(--space-2) var(--space-4)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-xs)",
  letterSpacing: "var(--track-mono)",
  textTransform: "uppercase",
  textDecoration: "none",
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text-muted)",
};

function segStyle(active: boolean): React.CSSProperties {
  return active
    ? { ...segBase, background: "var(--btn-primary-bg)", color: "var(--btn-primary-fg)", borderColor: "var(--btn-primary-bg)" }
    : segBase;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; region?: string; year?: string }>;
}) {
  // HR-only. Defense in depth: the nav already hides this for non-HR, but the guard
  // re-checks server-side and redirects anyone else away. Server actions re-check too.
  await requireRole("HR");
  const sp = await searchParams;
  const mode: Mode = sp.mode === "employee" ? "employee" : "system";

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Admin</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-4)" }}>
        Manage the whole tool from one place. <strong>System settings</strong> cover the rules everyone shares —
        entitlements, leave types, departments, regional calendars and blackout dates. <strong>Employee settings</strong>{" "}
        cover individual people — adding, importing and activating staff.
      </p>

      {/* Mode toggle — a segmented control rendered as in-place navigation (both segments
          load the same /admin page with a different ?mode). These are real navigating
          anchors, so the correct semantics are plain links with aria-current="page" on the
          active one — NOT an ARIA tab widget (no in-document tabpanels / roving focus here). */}
      <nav
        aria-label="Admin settings mode"
        style={{ display: "flex", gap: 0, marginBottom: "var(--space-6)", maxWidth: 420 }}
      >
        <a
          href="/admin?mode=system"
          aria-current={mode === "system" ? "page" : undefined}
          style={segStyle(mode === "system")}
          data-testid="admin-mode-system"
        >
          System settings
        </a>
        <a
          href="/admin?mode=employee"
          aria-current={mode === "employee" ? "page" : undefined}
          style={{ ...segStyle(mode === "employee"), borderLeft: "none" }}
          data-testid="admin-mode-employee"
        >
          Employee settings
        </a>
      </nav>

      {mode === "system" ? (
        <div data-testid="admin-system" style={{ display: "flex", flexDirection: "column", gap: "var(--space-7)" }}>
          <ConfigSection />
          <CalendarsSection regionId={sp.region} yearStr={sp.year} formAction="/admin" preserveMode />
          <RestrictedDaysSection />
        </div>
      ) : (
        <div data-testid="admin-employee">
          <EmployeesSection />
        </div>
      )}
    </div>
  );
}
