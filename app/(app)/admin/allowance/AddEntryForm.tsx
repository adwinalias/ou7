"use client";

import { useActionState } from "react";
import { addEntryAction, type EntryState } from "./actions";

const fieldCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };

export default function AddEntryForm({ periodId }: { periodId: string }) {
  const [state, action, pending] = useActionState<EntryState, FormData>(addEntryAction, null);
  return (
    <form action={action} style={{ display: "flex", gap: "var(--space-3)", alignItems: "end", flexWrap: "wrap" }}>
      <input type="hidden" name="periodId" value={periodId} />
      <label className="t-label" style={fieldCol}>Kind
        <select name="kind" className="input" defaultValue="ADJUSTMENT" data-testid="entry-kind">
          <option value="ADJUSTMENT">Adjustment (+/−)</option>
          <option value="DEDUCTION">Deduction (+)</option>
        </select>
      </label>
      <label className="t-label" style={fieldCol}>Days (delta)
        <input type="number" step="0.5" name="delta" required aria-required="true" className="input t-num" data-testid="entry-delta" />
      </label>
      <label className="t-label" style={{ ...fieldCol, flex: "1 1 220px" }}>Reason
        <input name="reason" required aria-required="true" className="input" placeholder="e.g. goodwill grant" data-testid="entry-reason" />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending} data-testid="entry-submit">{pending ? "…" : "Add to ledger"}</button>
      {state && <span role={state.ok ? "status" : "alert"} style={{ fontSize: "var(--text-xs)", color: state.ok ? "var(--success)" : "var(--danger)" }} data-testid="entry-result">{state.message}</span>}
    </form>
  );
}
