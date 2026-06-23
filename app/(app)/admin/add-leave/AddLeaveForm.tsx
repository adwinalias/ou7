"use client";

import { useActionState, useState } from "react";
import { addLeaveAction, type AddLeaveState } from "./actions";

const fieldCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };

export default function AddLeaveForm({
  employees,
  leaveTypes,
}: {
  employees: { id: string; name: string }[];
  leaveTypes: { id: string; name: string }[];
}) {
  const [mode, setMode] = useState<"DAY" | "HALF" | "MULTI">("DAY");
  const [state, action, pending] = useActionState<AddLeaveState, FormData>(addLeaveAction, null);

  return (
    <form action={action} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "var(--space-3)", alignItems: "end" }}>
      <label className="t-label" style={fieldCol}>Employee
        <select name="employeeId" className="input" required aria-required="true" data-testid="ob-employee">{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      </label>
      <label className="t-label" style={fieldCol}>Leave type
        <select name="leaveTypeId" className="input" required aria-required="true" data-testid="ob-type">{leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </label>
      <label className="t-label" style={fieldCol}>Duration
        <select name="mode" className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} data-testid="ob-mode">
          <option value="DAY">All day</option><option value="HALF">Half day</option><option value="MULTI">Multi-day</option>
        </select>
      </label>
      <label className="t-label" style={fieldCol}>{mode === "MULTI" ? "Start" : "Date"}
        <input type="date" name="startDate" required aria-required="true" className="input t-num" data-testid="ob-start" />
      </label>
      {mode === "MULTI" && (
        <label className="t-label" style={fieldCol}>End<input type="date" name="endDate" required aria-required="true" className="input t-num" data-testid="ob-end" /></label>
      )}
      {mode === "HALF" && (
        <label className="t-label" style={fieldCol}>AM/PM
          <select name="halfDayPeriod" className="input"><option value="AM">Morning</option><option value="PM">Afternoon</option></select>
        </label>
      )}
      <label className="t-label" style={fieldCol}>Notes<input name="notes" className="input" data-testid="ob-notes" /></label>
      <button type="submit" className="btn btn-primary" disabled={pending} data-testid="ob-submit">{pending ? "…" : "Add leave"}</button>
      {state && <span role={state.ok ? "status" : "alert"} style={{ fontSize: "var(--text-xs)", color: state.ok ? "var(--success)" : "var(--danger)" }} data-testid="ob-result">{state.message}</span>}
    </form>
  );
}
