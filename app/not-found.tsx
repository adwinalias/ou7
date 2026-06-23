import Link from "next/link";

// Epic 22.1 — Custom 404. Rendered for unmatched routes and on notFound() calls.
// This renders inside the ROOT layout (which applies globals.css + tokens), so it can
// use the design tokens and shared classes. On-brand: warm paper background, sharp
// corners, a single clear action back to the dashboard.
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        color: "var(--text)",
        padding: "var(--space-5)",
      }}
    >
      <div
        className="card"
        style={{ padding: "var(--space-7)", maxWidth: 440, textAlign: "center" }}
      >
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>
          N°17 · OU7 · 404
        </div>
        <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>
          Page not found
        </h1>
        <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
          We couldn&apos;t find the page you were looking for. It may have moved, or the
          link may be out of date.
        </p>
        <Link className="btn btn-primary" href="/dashboard">
          Go to dashboard
        </Link>
      </div>
    </main>
  );
}
