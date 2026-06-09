"use client";

import { useActionState } from "react";
import { createHRLogAction, type HRLogState } from "./actions";

const fieldCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };

export default function HRLogForm({ employees }: { employees: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<HRLogState, FormData>(createHRLogAction, null);
  return (
    <form action={action} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "var(--space-3)", alignItems: "end" }}>
      <label className="t-label" style={fieldCol}>Employee
        <select name="employeeId" className="input" required data-testid="log-employee">
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </label>
      <label className="t-label" style={fieldCol}>Type
        <select name="type" className="input" defaultValue="OOO" data-testid="log-type">
          <option value="OOO">Out of office</option>
          <option value="WFH">Working from home</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label className="t-label" style={fieldCol}>From<input type="date" name="start" required className="input t-num" data-testid="log-start" /></label>
      <label className="t-label" style={fieldCol}>To<input type="date" name="end" required className="input t-num" data-testid="log-end" /></label>
      <label className="t-label" style={fieldCol}>Notes (private)<input name="notes" className="input" data-testid="log-notes" /></label>
      <button type="submit" className="btn btn-primary" disabled={pending} data-testid="log-submit">{pending ? "…" : "Add log"}</button>
      {state && <span style={{ fontSize: "var(--text-xs)", color: state.ok ? "var(--success)" : "var(--danger)" }}>{state.message}</span>}
    </form>
  );
}
