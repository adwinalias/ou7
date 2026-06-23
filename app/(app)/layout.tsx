import { canAccessAdmin, isApprover } from "@/core/authz";
import AppNav from "@/components/AppNav";
import BottomTabBar from "@/components/BottomTabBar";
import ThemeSwitch from "@/components/ThemeSwitch";
import { requireUser } from "@/lib/rbac";

// Authenticated app shell. Every route under (app) is guarded here: requireUser()
// redirects unauthenticated users to /sign-in and unprovisioned/inactive accounts to
// /not-provisioned (which lives OUTSIDE this group to avoid a redirect loop).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireUser();

  return (
    <div className="app-shell" style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "220px 1fr" }}>
      <aside
        className="no-print app-sidebar"
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "var(--space-4) 0",
        }}
      >
        <div className="brand-logo" style={{ padding: "0 12px var(--space-3)" }}>
          {/* Theme-swapped brand lockups; next/image's optimisation isn't needed for a tiny static logo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-light" src="/brand/ou7-light-bg.png" alt="OU7" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-dark" src="/brand/ou7-dark-bg.png" alt="OU7" />
        </div>
        <AppNav canSeeApprovals={isApprover(actor)} canSeeAdmin={canAccessAdmin(actor)} />
      </aside>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          className="no-print"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "var(--space-3) var(--space-5)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="t-muted" style={{ fontSize: 13 }}>Interesting Times DMCC</div>
          <ThemeSwitch />
        </header>
        <main className="app-main" style={{ padding: "var(--space-6) var(--space-5)" }}>{children}</main>
      </div>
      <BottomTabBar canSeeApprovals={isApprover(actor)} canSeeAdmin={canAccessAdmin(actor)} />
    </div>
  );
}
