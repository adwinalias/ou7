"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  isSavedLayout,
  resolveLayout,
  type SavedLayout,
} from "@/lib/dashboard-layout";

export type DashboardWidget = {
  /** Stable, id-keyed registry entry — adding a widget later (18.2+) is just a new id. */
  id: string;
  /** Accessible title for the tile (used in move/add control labels). */
  title: string;
  /** Server-rendered tile content. RSC nodes passed to a client component as props — allowed. */
  content: ReactNode;
};

// localStorage key — mirrors ThemeSwitch's `ou7-theme` per-user-preference pattern.
// NOTE: persistence is per-browser only. Cross-device sync would be a future
// DB-backed enhancement (would require a Prisma field + an ADR — out of scope here).
const STORAGE_KEY = "ou7-dashboard-layout-v1";

function readSaved(): SavedLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSavedLayout(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSaved(layout: SavedLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* ignore (private mode / quota) */
  }
}

export default function DashboardGrid({ widgets }: { widgets: DashboardWidget[] }) {
  const registeredIds = useMemo(() => widgets.map((w) => w.id), [widgets]);
  // Default order is the order the server passed the widgets in.
  const defaultOrder = registeredIds;

  // First paint (SSR + initial client render) uses the DEFAULT layout so there's
  // no hydration mismatch. The stored layout is applied in useEffect after mount;
  // a brief post-mount reflow is acceptable (per implementation guidance).
  const [layout, setLayout] = useState<SavedLayout>(() =>
    resolveLayout(null, registeredIds, defaultOrder),
  );
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setLayout(resolveLayout(readSaved(), registeredIds, defaultOrder));
    // registeredIds/defaultOrder are derived from the stable widgets prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: SavedLayout) {
    setLayout(next);
    writeSaved(next);
  }

  const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
  const hidden = useMemo(() => new Set(layout.hidden), [layout.hidden]);
  const visibleIds = layout.order.filter((id) => !hidden.has(id));
  const hiddenWidgets = layout.order
    .filter((id) => hidden.has(id))
    .map((id) => byId.get(id))
    .filter((w): w is DashboardWidget => Boolean(w));

  function move(id: string, dir: -1 | 1) {
    // Reorder within the VISIBLE sequence, then splice back into the full order.
    const vis = [...visibleIds];
    const i = vis.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= vis.length) return;
    const a = vis[i]!;
    const b = vis[j]!;
    vis[i] = b;
    vis[j] = a;
    // Rebuild full order: visible ids in their new sequence, hidden ids kept after.
    const hiddenInOrder = layout.order.filter((x) => hidden.has(x));
    persist({ order: [...vis, ...hiddenInOrder], hidden: layout.hidden });
  }

  function remove(id: string) {
    if (hidden.has(id)) return;
    persist({ order: layout.order, hidden: [...layout.hidden, id] });
  }

  function add(id: string) {
    persist({ order: layout.order, hidden: layout.hidden.filter((x) => x !== id) });
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "var(--space-4)",
        }}
      >
        <button
          type="button"
          className={editing ? "btn btn-primary" : "btn btn-secondary"}
          aria-pressed={editing}
          onClick={() => setEditing((e) => !e)}
          data-testid="dash-edit-toggle"
        >
          {editing ? "Done" : "Edit layout"}
        </button>
      </div>

      {editing && hiddenWidgets.length > 0 && (
        <div
          className="card"
          role="group"
          aria-label="Add widget"
          style={{
            padding: "var(--space-4)",
            marginBottom: "var(--space-4)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--space-3)",
          }}
        >
          <span className="t-label">Add widget</span>
          {hiddenWidgets.map((w) => (
            <button
              key={w.id}
              type="button"
              className="btn btn-secondary"
              onClick={() => add(w.id)}
              data-testid={`dash-add-${w.id}`}
            >
              + {w.title}
            </button>
          ))}
        </div>
      )}

      <div
        className="dash-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
          gridAutoRows: "1fr",
          gap: "var(--space-4)",
        }}
      >
        {visibleIds.map((id, idx) => {
          const w = byId.get(id);
          if (!w) return null;
          return (
            <section
              key={id}
              className="card"
              aria-label={w.title}
              style={{
                padding: "var(--space-5)",
                display: "flex",
                flexDirection: "column",
              }}
              data-testid={`dash-tile-${id}`}
            >
              {editing && (
                <div
                  role="group"
                  aria-label={`${w.title} controls`}
                  style={{
                    display: "flex",
                    gap: "var(--space-2)",
                    marginBottom: "var(--space-4)",
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: "var(--space-3)",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => move(id, -1)}
                    disabled={idx === 0}
                    aria-label={`Move ${w.title} up`}
                    data-testid={`dash-up-${id}`}
                  >
                    ↑ Up
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => move(id, 1)}
                    disabled={idx === visibleIds.length - 1}
                    aria-label={`Move ${w.title} down`}
                    data-testid={`dash-down-${id}`}
                  >
                    ↓ Down
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => remove(id)}
                    aria-label={`Remove ${w.title}`}
                    style={{ marginLeft: "auto" }}
                    data-testid={`dash-remove-${id}`}
                  >
                    Remove
                  </button>
                </div>
              )}
              <div style={{ flex: 1 }}>{w.content}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
