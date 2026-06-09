"use client";

import { useActionState } from "react";
import { importAction } from "./actions";
import type { ImportSummary } from "@/lib/employees";

export default function ImportForm() {
  const [state, action, pending] = useActionState<ImportSummary | null, FormData>(importAction, null);
  return (
    <form action={action}>
      <p className="t-muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>
        One per line: <span className="t-num">email,firstName,lastName,region,joiningDate</span> (a header row is ignored).
      </p>
      <textarea
        name="csv"
        className="input"
        style={{ width: "100%", minHeight: 100, resize: "vertical", fontFamily: "var(--font-mono)" }}
        placeholder="ada@interestingtimes.me,Ada,Lovelace,UAE,2026-03-01"
        data-testid="import-csv"
      />
      <button type="submit" className="btn btn-primary" style={{ marginTop: "var(--space-2)" }} disabled={pending} data-testid="import-submit">
        {pending ? "Importing…" : "Import"}
      </button>

      {state && (
        <div role="status" style={{ marginTop: "var(--space-3)", border: "1px solid var(--border)", borderLeft: `3px solid ${state.errors.length ? "var(--warning)" : "var(--success)"}`, padding: "var(--space-3)" }} data-testid="import-result">
          <strong className="t-num">{state.created}</strong> created
          {state.errors.length > 0 && (
            <ul style={{ margin: "var(--space-2) 0 0", paddingLeft: "var(--space-4)", color: "var(--danger)", fontSize: "var(--text-sm)" }}>
              {state.errors.map((e) => <li key={`${e.line}-${e.message}`}>Line {e.line}: {e.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
