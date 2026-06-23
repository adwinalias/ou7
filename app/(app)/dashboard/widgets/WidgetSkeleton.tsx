// Sized Suspense fallback for a streamed dashboard widget (Epic 21.2 / 21.5 — CLS).
// Presentational only; tokens only. The placeholder reserves a typical widget height so
// the tile doesn't jump when its real content streams in (no layout shift). A gentle pulse
// runs ONLY when the user has no reduced-motion preference; the global reduce rule in
// design/tokens.css also disables animations, and gating the keyframes behind
// prefers-reduced-motion: no-preference means reduced-motion users get a static block.
import type { CSSProperties } from "react";

const bar: CSSProperties = {
  height: 12,
  background: "var(--surface-2)",
  borderRadius: 0,
};

/**
 * @param minHeight reserved height (px) so the skeleton matches its widget's typical size,
 *   preventing layout shift when the real content streams in.
 */
export default function WidgetSkeleton({ minHeight = 180 }: { minHeight?: number }) {
  return (
    <div
      className="widget-skeleton"
      data-testid="widget-skeleton"
      // role=status + aria-busy announces a transient loading region to AT without
      // pretending to be content; aria-label keeps it labelled while empty.
      role="status"
      aria-busy="true"
      aria-label="Loading"
      style={{
        minHeight,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      {/* A label-width then a few content rows: enough to read as "a widget is loading". */}
      <div style={{ ...bar, width: "40%" }} />
      <div style={{ ...bar, width: "85%" }} />
      <div style={{ ...bar, width: "70%" }} />
      <div style={{ ...bar, width: "78%" }} />
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        Loading…
      </span>
    </div>
  );
}
