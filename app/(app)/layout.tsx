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
      {/* Skip-to-content link (Epic 20.4): visually hidden until focused, then it reveals as
          the first focusable element so keyboard users can jump past the nav to the page.
          Styled via tokens (.skip-link in globals.css); shows the global green focus ring. */}
      <a href="#main-content" className="skip-link no-print">Skip to content</a>
      <aside
        className="no-print app-sidebar"
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "var(--space-4) 0",
        }}
      >
        <AppNav canSeeApprovals={isApprover(actor)} canSeeAdmin={canAccessAdmin(actor)} />
      </aside>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          className="no-print"
          aria-label="OU7"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-5)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {/* Brand lockup + org name. The logo lives HERE (not the sidebar) so it renders at
              every breakpoint — the sidebar is hidden ≤640px (Epic 17.1), so a sidebar-only
              logo would vanish on mobile (Epic 17.5 AC: visibly larger in both themes AND on
              mobile). */}
          <div className="brand-logo" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
            {/* Single accessible logo node (L2): one element announced to screen readers.
                The lockup PNG is a CSS background-image swapped by [data-theme="dark"] — the
                app toggles theme via data-theme on <html>, so a <picture media> query would
                NOT track the toggle. Explicit width+height avoid CLS. */}
            <span className="brand-mark" role="img" aria-label="OU7 — Interesting Times leave management" />
            <div className="t-muted" style={{ fontSize: 13 }}>Interesting Times</div>
          </div>
          <ThemeSwitch />
        </header>
        <main id="main-content" className="app-main">{children}</main>
      </div>
      <BottomTabBar canSeeApprovals={isApprover(actor)} canSeeAdmin={canAccessAdmin(actor)} />
    </div>
  );
}
