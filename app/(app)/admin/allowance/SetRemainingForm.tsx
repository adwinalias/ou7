"use client";

import { useActionState, useState } from "react";
import { setRemainingAction, type EntryState } from "./actions";

const fieldCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };

/**
 * "Set remaining to X" helper (Epic 31.1). Computes the implied delta client-side from the
 * displayed currentRemaining + typed target (simple arithmetic — no server round-trip needed
 * for the preview). Submits ONE typed VACATION ADJUSTMENT via the ledger. ponytail: client
 * arithmetic is sufficient; previewSetRemaining is available for non-UI callers.
 */
export default function SetRemainingForm({ periodId, currentRemaining }: { periodId: string; currentRemaining: number }) {
  const [state, action, pending] = useActionState<EntryState, FormData>(setRemainingAction, null);
  const [target, setTarget] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const targetNum = parseFloat(target);
  const valid = Number.isFinite(targetNum);
  const impliedDelta = valid ? Math.round((targetNum - currentRemaining) * 100) / 100 : null;
  const canApply = valid && reason.trim().length > 0 && !pending;

  const sign = impliedDelta !== null && impliedDelta >= 0 ? "+" : "";
  const previewText =
    impliedDelta !== null
      ? impliedDelta === 0
        ? `Current remaining ${currentRemaining} → target ${targetNum} ⇒ no change needed`
        : `Current remaining ${currentRemaining} → target ${targetNum} ⇒ ${sign}${impliedDelta} day adjustment`
      : null;

  return (
    <form action={action} style={{ display: "flex", gap: "var(--space-3)", alignItems: "end", flexWrap: "wrap" }}>
      <input type="hidden" name="periodId" value={periodId} />
      <label className="t-label" style={fieldCol}>
        Set remaining to (days)
        <input
          type="number"
          step="0.5"
          name="target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          required
          aria-required="true"
          className="input t-num"
          style={{ width: 90 }}
          data-testid="set-remaining-target"
        />
      </label>
      <label className="t-label" style={{ ...fieldCol, flex: "1 1 220px" }}>
        Reason
        <input
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          aria-required="true"
          className="input"
          placeholder="e.g. correction per payroll audit"
          data-testid="set-remaining-reason"
        />
      </label>
      {previewText && (
        <span
          className="t-muted"
          style={{ fontSize: "var(--text-xs)", alignSelf: "center", minWidth: 240 }}
          aria-live="polite"
          data-testid="set-remaining-preview"
        >
          {previewText}
        </span>
      )}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={!canApply}
        data-testid="set-remaining-submit"
        aria-disabled={!canApply}
        style={{ minHeight: 40, minWidth: 80 }}
      >
        {pending ? "…" : "Apply"}
      </button>
      {state && (
        <span
          role={state.ok ? "status" : "alert"}
          style={{ fontSize: "var(--text-xs)", color: state.ok ? "var(--success)" : "var(--danger)" }}
          data-testid="set-remaining-result"
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
