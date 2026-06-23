"use client";

import Link from "next/link";
import { useEffect } from "react";

// Epic 22.1 — Localised segment boundary for the authenticated app. Catches errors
// thrown while rendering ANY route under (app) so one screen's failure shows a contained
// fallback card instead of blanking the whole app. Renders WITHIN the (app) layout, so the
// app shell (nav, header) and the design tokens/globals are applied here — we use tokens
// and the shared .card/.btn classes. Truly-unexpected/root errors fall through to
// app/global-error.tsx; authz failures (AuthError) are still thrown and caught here.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log for diagnostics; never surface the stack/digest/PII in the UI.
    console.error("(app) error boundary:", error);
  }, [error]);

  return (
    <div style={{ padding: "var(--space-6)", display: "grid", placeItems: "center" }}>
      <section
        className="card"
        role="alert"
        style={{ padding: "var(--space-6)", maxWidth: 440, textAlign: "center" }}
        data-testid="app-error"
      >
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>
          Error
        </div>
        <h1 className="t-h2" style={{ marginBottom: "var(--space-2)" }}>
          Something went wrong on this page
        </h1>
        <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
          The page couldn&apos;t be loaded. You can try again, or go back to your
          dashboard.
        </p>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => reset()}
            data-testid="app-error-retry"
          >
            Try again
          </button>
          <Link className="btn btn-secondary" href="/dashboard">
            Go to dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
