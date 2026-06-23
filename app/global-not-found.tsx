// Epic 22.1 — global-not-found (Next.js experimental, requires experimental.globalNotFound).
// Rendered for top-level / unmatched URLs that never reach a route's own layout. Like
// global-error it renders OUTSIDE the root layout, so it declares its own <html>/<body>
// and inlines on-brand styles (it cannot rely on globals.css/tokens being applied).
import Link from "next/link";

export const metadata = {
  title: "Page not found · OU7",
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#F2F0EA",
          color: "#0A0A0A",
          fontFamily:
            "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          lineHeight: 1.55,
        }}
      >
        <main
          style={{
            background: "#FBFAF5",
            border: "1px solid #DCD8CE",
            padding: 48,
            maxWidth: 440,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
              fontSize: 12,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#5C5A52",
              marginBottom: 12,
            }}
          >
            N°17 · OU7 · 404
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>
            Page not found
          </h1>
          <p style={{ color: "#5C5A52", margin: "0 0 24px" }}>
            We couldn&apos;t find the page you were looking for.
          </p>
          <Link
            href="/dashboard"
            style={{
              font: "inherit",
              fontWeight: 600,
              padding: "8px 16px",
              border: "1px solid transparent",
              borderRadius: 2,
              background: "#0A0A0A",
              color: "#F2F0EA",
              textDecoration: "none",
            }}
          >
            Go to dashboard
          </Link>
        </main>
      </body>
    </html>
  );
}
