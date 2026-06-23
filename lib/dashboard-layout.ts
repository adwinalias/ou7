// Pure layout-resolution logic for the customizable dashboard widget grid (Epic 18.1).
//
// This module is intentionally PURE — no DOM, no localStorage, no React. The
// DashboardGrid client component owns persistence (it reads/writes localStorage
// mirroring ThemeSwitch) and calls resolveLayout() to reconcile the stored
// layout against the set of widgets actually registered at runtime.
//
// Keeping the reconciliation here (rather than inline in the component) makes it
// unit-testable and means future widgets added in 18.2+ resolve gracefully.

export type SavedLayout = {
  /** Ordered widget ids the user has arranged (visible + hidden may both appear). */
  order: string[];
  /** Widget ids the user has removed from the grid. */
  hidden: string[];
};

/**
 * Reconcile a saved layout against the currently-registered widgets.
 *
 * Rules (see Epic 18.1 AC4):
 *  - `saved === null` (brand-new user) → the default order, nothing hidden.
 *  - Saved order is respected for ids that are still registered.
 *  - Unknown ids in the saved order/hidden (e.g. a removed widget) are dropped.
 *  - Registered ids missing from the saved order (e.g. a future 18.2+ widget) are
 *    appended in their default position — i.e. ordered by `defaultOrder`, after
 *    the ids the user has explicitly arranged.
 *  - The hidden set is preserved (intersected with registered ids).
 *
 * The function is idempotent: feeding its own output back in yields the same result.
 */
export function resolveLayout(
  saved: SavedLayout | null,
  registeredIds: string[],
  defaultOrder: string[],
): SavedLayout {
  const registered = new Set(registeredIds);

  // The default visible order: defaultOrder filtered to registered ids, then any
  // registered ids not named in defaultOrder appended (stable on registeredIds).
  const defaults: string[] = [
    ...defaultOrder.filter((id) => registered.has(id)),
    ...registeredIds.filter((id) => !defaultOrder.includes(id)),
  ];

  if (!saved) {
    return { order: defaults, hidden: [] };
  }

  // Saved order, keeping only ids that are still registered, de-duplicated.
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of saved.order) {
    if (registered.has(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }

  // Append any registered ids missing from the saved order, in default position.
  for (const id of defaults) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }

  // Hidden set: registered ids only, and only those present in the resolved order.
  const orderSet = new Set(order);
  const hidden = [...new Set(saved.hidden)].filter((id) => orderSet.has(id));

  return { order, hidden };
}

/** True when the value is a structurally-valid SavedLayout (defensive parse of stored JSON). */
export function isSavedLayout(value: unknown): value is SavedLayout {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.order) &&
    v.order.every((x) => typeof x === "string") &&
    Array.isArray(v.hidden) &&
    v.hidden.every((x) => typeof x === "string")
  );
}
