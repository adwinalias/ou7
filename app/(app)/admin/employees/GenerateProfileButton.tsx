"use client";

import { useActionState } from "react";
import { generateProfileAction, type ProfileState } from "./actions";

export default function GenerateProfileButton({ employeeId, year }: { employeeId: string; year: number }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(generateProfileAction, null);
  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="year" value={year} />
      <button type="submit" className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={pending} data-testid="gen-profile">
        {pending ? "…" : "Generate profile"}
      </button>
      {state && (
        <span style={{ fontSize: "var(--text-xs)", color: state.ok ? "var(--success)" : "var(--danger)", maxWidth: 220 }} data-testid="gen-result">
          {state.message}
        </span>
      )}
    </form>
  );
}
