// "Who's off" widget (Epic 18.2; streamed per 21.2). Async server component that awaits its
// own company-wide read. The four-category abstraction/privacy is enforced SERVER-SIDE in
// lib/whosoff (non-HR entries never carry a raw type), so nothing to hide here — unchanged.
// Markup/testids (whosoff-list / whosoff-empty / whosoff-entry / whosoff-calendar-link) kept.
import Link from "next/link";
import type { Actor } from "@/core/types";
import { type WhosOffEntryHR } from "@/lib/whosoff";
import { cachedGetWhosOff } from "./data";
import { shortDate } from "./format";

export default async function WhosOffWidget({ actor }: { actor: Actor }) {
  const data = await cachedGetWhosOff(actor);
  return (
    <>
      <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>Who&apos;s off</div>
      {data.entries.length === 0 ? (
        <p className="t-muted" data-testid="whosoff-empty">No one is off in the next {data.days} days.</p>
      ) : (
        <ul data-testid="whosoff-list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {data.entries.map((e, i) => {
            const pending = e.status === "PENDING";
            // HR sees the real type; everyone else sees only the abstracted category.
            const label = data.hr ? `${(e as WhosOffEntryHR).typeName}` : e.category;
            const range = e.startISO === e.endISO ? shortDate(e.startISO) : `${shortDate(e.startISO)} – ${shortDate(e.endISO)}`;
            return (
              <li
                key={`${e.employeeId}-${i}`}
                data-testid="whosoff-entry"
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  flexWrap: "wrap",
                  gap: "var(--space-2)",
                  // Pending = grey + coloured left bar (design system §2); approved = clear.
                  ...(pending
                    ? {
                        background: "var(--status-pending-bg)",
                        color: "var(--status-pending-fg)",
                        borderLeft: "3px solid var(--cell-lt, var(--border-strong))",
                        padding: "var(--space-2) var(--space-3)",
                      }
                    : { paddingBlock: "var(--space-1)" }),
                  // HR colours the left bar with the real type; non-HR stays neutral so no
                  // type signal leaks via colour.
                  ...(pending && data.hr ? { ["--cell-lt" as string]: (e as WhosOffEntryHR).color } : {}),
                }}
              >
                <span style={{ fontWeight: 600 }}>{e.name}</span>
                <span className="t-muted" style={{ fontSize: "var(--text-sm)" }}>
                  {label} · {e.regionName}
                </span>
                <span className="t-num" style={{ fontSize: "var(--text-xs)", marginLeft: "auto" }}>
                  {e.offToday ? "Today" : range}
                </span>
                {pending && (
                  <span className="pill pill-pending" style={{ fontSize: "var(--text-xs)" }}>Pending</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p style={{ marginTop: "var(--space-4)" }}>
        <Link className="btn btn-secondary" href="/wall-chart" data-testid="whosoff-calendar-link">View Team Calendar</Link>
      </p>
    </>
  );
}
