"use client";

// Epic 22.1 — Root-layout error boundary. global-error.tsx replaces the ROOT layout
// when an error is thrown in it (or in a render that escapes every nested error.tsx),
// so it MUST declare its own <html>/<body> and cannot rely on app/globals.css or the
// design tokens being applied. We therefore inline an on-brand, self-contained fallback
// (warm near-black/near-white, sharp corners, no gradients/shadows) rather than using
// token vars or shared classes. This is the last-resort screen; the localised
// (app)/error.tsx handles the common case without blanking the whole app.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log for diagnostics; never surface the stack/digest/PII in the UI.
  console.error("global-error boundary:", error);

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
            N°17 · OU7
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#5C5A52", margin: "0 0 24px" }}>
            The app hit an unexpected error. You can try again, or head back to your
            dashboard.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                font: "inherit",
                fontWeight: 600,
                padding: "8px 16px",
                border: "1px solid transparent",
                borderRadius: 2,
                background: "#0A0A0A",
                color: "#F2F0EA",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/dashboard"
              style={{
                font: "inherit",
                fontWeight: 600,
                padding: "8px 16px",
                border: "1px solid #C7C2B5",
                borderRadius: 2,
                background: "transparent",
                color: "#0A0A0A",
                textDecoration: "none",
              }}
            >
              Go to dashboard
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
