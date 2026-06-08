import AppNav from "@/components/AppNav";
import ThemeSwitch from "@/components/ThemeSwitch";

// Authenticated app shell. (Route protection via getServerSession is added in EPIC 1.4.)
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "220px 1fr" }}>
      <aside
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "var(--space-4) 0",
        }}
      >
        <div className="t-label" style={{ padding: "0 12px var(--space-3)" }}>N°17 · OU7</div>
        <AppNav />
      </aside>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
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
        <main style={{ padding: "var(--space-6) var(--space-5)" }}>{children}</main>
      </div>
    </div>
  );
}
