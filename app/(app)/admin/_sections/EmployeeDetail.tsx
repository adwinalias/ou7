"use client";

import { useActionState, useId, useRef, useState } from "react";
import { updateEmployeeAction, type UpdateEmployeeState } from "../employees/actions";

const LEVELS = ["NONE", "APPROVER", "APPROVER_ADD", "APPROVER_ADD_EDIT"] as const;
const LEVEL_LABEL: Record<string, string> = {
  NONE: "None",
  APPROVER: "Approver",
  APPROVER_ADD: "Approver +Add",
  APPROVER_ADD_EDIT: "Approver +Add/Edit",
};
const fieldCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };

export interface EmployeeForEdit {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  regionId: string;
  departmentId: string | null;
  approverLevel: string;
  employmentType: string;
}

type Option = { id: string; name: string };

// Editable employee record with change-safety (Epic 19.3b — AD7, AD8). Non-sensitive edits
// (name, employment type) save straight away; sensitive edits (region, department, approver
// level) require an explicit Confirm step that lists exactly what is changing before the
// server action runs. Authz is re-checked server-side in updateEmployeeAction.
export default function EmployeeDetail({
  employee,
  regions,
  departments,
}: {
  employee: EmployeeForEdit;
  regions: Option[];
  departments: Option[];
}) {
  const [state, action, pending] = useActionState<UpdateEmployeeState, FormData>(updateEmployeeAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Controlled values so we can diff against the original on save.
  const [regionId, setRegionId] = useState(employee.regionId);
  const [departmentId, setDepartmentId] = useState(employee.departmentId ?? "");
  const [approverLevel, setApproverLevel] = useState(employee.approverLevel);
  const [confirming, setConfirming] = useState<{ label: string; from: string; to: string }[] | null>(null);

  const regionName = (id: string) => regions.find((r) => r.id === id)?.name ?? id;
  const deptName = (id: string) => (id ? (departments.find((d) => d.id === id)?.name ?? id) : "—");

  function sensitiveChanges() {
    const out: { label: string; from: string; to: string }[] = [];
    if (regionId !== employee.regionId) out.push({ label: "Region", from: regionName(employee.regionId), to: regionName(regionId) });
    if (departmentId !== (employee.departmentId ?? "")) out.push({ label: "Department", from: deptName(employee.departmentId ?? ""), to: deptName(departmentId) });
    if (approverLevel !== employee.approverLevel) out.push({ label: "Approver level", from: LEVEL_LABEL[employee.approverLevel] ?? employee.approverLevel, to: LEVEL_LABEL[approverLevel] ?? approverLevel });
    return out;
  }

  // Intercept submit: if a sensitive field changed, open the confirm step first.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (confirming) return; // confirmed submit — let it through
    const changes = sensitiveChanges();
    if (changes.length > 0) {
      e.preventDefault();
      setConfirming(changes);
      // Move focus to the confirm action once the step renders.
      requestAnimationFrame(() => confirmBtnRef.current?.focus());
    }
  }

  function confirmAndSave() {
    setConfirming(null);
    formRef.current?.requestSubmit();
  }

  const headingId = useId();

  return (
    <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-6)" }} data-testid="employee-detail">
      <div className="t-label" style={{ marginBottom: "var(--space-2)" }}>Employee record</div>
      <p className="t-muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>
        <strong>{employee.email}</strong> — email is fixed. Changing region, department or approver level asks you to confirm first.
      </p>

      <form ref={formRef} action={action} onSubmit={onSubmit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "var(--space-3)", alignItems: "end" }}>
        <input type="hidden" name="employeeId" value={employee.id} />

        <label className="t-label" style={fieldCol}>Email (read-only)
          <input className="input" value={employee.email} readOnly disabled data-testid="ed-email" />
        </label>
        <label className="t-label" style={fieldCol}>First name
          <input name="firstName" required aria-required="true" className="input" defaultValue={employee.firstName} data-testid="ed-first" />
        </label>
        <label className="t-label" style={fieldCol}>Last name
          <input name="lastName" required aria-required="true" className="input" defaultValue={employee.lastName} data-testid="ed-last" />
        </label>
        <label className="t-label" style={fieldCol}>Region
          <select name="regionId" className="input" value={regionId} onChange={(e) => setRegionId(e.target.value)} data-testid="ed-region">
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="t-label" style={fieldCol}>Department
          <select name="departmentId" className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="ed-department">
            <option value="">—</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="t-label" style={fieldCol}>Approver level
          <select name="approverLevel" className="input" value={approverLevel} onChange={(e) => setApproverLevel(e.target.value)} data-testid="ed-level">
            {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </select>
        </label>
        <label className="t-label" style={fieldCol}>Type
          <select name="employmentType" className="input" defaultValue={employee.employmentType} data-testid="ed-type">
            <option value="FULL_TIME">Full-time</option>
            <option value="FLEX">Flex</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending} data-testid="ed-save">{pending ? "…" : "Save changes"}</button>
        {state && <span role="status" style={{ fontSize: "var(--text-xs)", color: state.ok ? "var(--success)" : "var(--danger)" }} data-testid="ed-result">{state.message}</span>}
      </form>

      {/* Change-safety confirm step (AD8). An alertdialog listing the sensitive changes;
          focus is moved here on open and the Confirm/Cancel are keyboard-operable. */}
      {confirming && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={headingId}
          data-testid="ed-confirm"
          style={{ marginTop: "var(--space-4)", padding: "var(--space-4)", border: "1px solid var(--border-strong)", background: "var(--surface)" }}
        >
          <div id={headingId} className="t-label" style={{ marginBottom: "var(--space-2)" }}>Confirm sensitive changes</div>
          <p className="t-muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
            You&apos;re about to change {confirming.length} setting{confirming.length === 1 ? "" : "s"} for {employee.firstName} {employee.lastName}:
          </p>
          <ul style={{ margin: "0 0 var(--space-4)", paddingLeft: "var(--space-5)" }} data-testid="ed-confirm-list">
            {confirming.map((c) => (
              <li key={c.label} className="t-num" style={{ fontSize: "var(--text-sm)", marginBottom: 2 }}>
                <span className="t-label">{c.label}:</span> {c.from} → {c.to}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button ref={confirmBtnRef} type="button" className="btn btn-primary" onClick={confirmAndSave} data-testid="ed-confirm-apply">Confirm &amp; save</button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(null)} data-testid="ed-confirm-cancel">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
