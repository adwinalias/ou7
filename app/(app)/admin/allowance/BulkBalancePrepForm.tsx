"use client";

// Epic 31.2 — Bulk balance prep. Mirrors SetRemainingForm: preview-then-apply, HR-only,
// audited. Preview is a server round-trip (reads DB); Apply is a server action.
import { useActionState, useState, useTransition } from "react";
import { bulkBalancePrepAction, type BulkPrepState } from "./actions";
import type { BulkBalancePrepPreview } from "@/lib/allowance-admin";

const fieldCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };

interface Props {
  departments: { id: string; name: string }[];
  defaultYear: number;
}

export default function BulkBalancePrepForm({ departments, defaultYear }: Props) {
  const [state, applyAction, pending] = useActionState<BulkPrepState, FormData>(bulkBalancePrepAction, null);
  const [isPreviewing, startPreview] = useTransition();

  const [year, setYear] = useState(String(defaultYear));
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [mode, setMode] = useState<"FIXED" | "COPY_PREVIOUS">("COPY_PREVIOUS");
  const [fixedValue, setFixedValue] = useState("22");
  const [preview, setPreview] = useState<BulkBalancePrepPreview | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  // Reset preview whenever inputs change so stale results don't confuse HR.
  function resetPreview() {
    setPreview(null);
    setPreviewErr(null);
  }

  async function handlePreview() {
    setPreviewErr(null);
    setPreview(null);
    const params = new URLSearchParams({
      year,
      departmentId,
      mode,
      ...(mode === "FIXED" ? { fixedValue } : {}),
    });
    const res = await fetch(`/api/admin/bulk-balance-prep/preview?${params}`);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setPreviewErr((j as { error?: string }).error ?? "Preview failed.");
      return;
    }
    setPreview(await res.json() as BulkBalancePrepPreview);
  }

  const yearNum = parseInt(year, 10);
  const validYear = Number.isFinite(yearNum) && yearNum >= 2020 && yearNum <= 2100;
  const validFixed = mode === "COPY_PREVIOUS" || (Number.isFinite(parseFloat(fixedValue)) && parseFloat(fixedValue) >= 0);
  const canPreview = validYear && validFixed && !isPreviewing;

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "end", marginBottom: "var(--space-4)" }}>
        <label className="t-label" style={fieldCol}>
          Department
          <select
            className="input"
            value={departmentId}
            onChange={(e) => { setDepartmentId(e.target.value); resetPreview(); }}
            data-testid="bbp-department"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="t-label" style={fieldCol}>
          Year
          <input
            type="number"
            className="input t-num"
            style={{ width: 90 }}
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => { setYear(e.target.value); resetPreview(); }}
            data-testid="bbp-year"
          />
        </label>
        <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <legend className="t-label" style={{ marginBottom: 4 }}>Opening source</legend>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer", minHeight: 40 }}>
            <input
              type="radio"
              name="bbp-mode"
              value="COPY_PREVIOUS"
              checked={mode === "COPY_PREVIOUS"}
              onChange={() => { setMode("COPY_PREVIOUS"); resetPreview(); }}
              data-testid="bbp-mode-copy"
            />
            <span className="t-label">Copy previous year opening</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer", minHeight: 40 }}>
            <input
              type="radio"
              name="bbp-mode"
              value="FIXED"
              checked={mode === "FIXED"}
              onChange={() => { setMode("FIXED"); resetPreview(); }}
              data-testid="bbp-mode-fixed"
            />
            <span className="t-label">Fixed value</span>
            {mode === "FIXED" && (
              <input
                type="number"
                step="0.5"
                min="0"
                className="input t-num"
                style={{ width: 80, marginLeft: "var(--space-2)" }}
                value={fixedValue}
                onChange={(e) => { setFixedValue(e.target.value); resetPreview(); }}
                aria-label="Fixed opening days"
                data-testid="bbp-fixed-value"
              />
            )}
          </label>
        </fieldset>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!canPreview}
          aria-disabled={!canPreview}
          onClick={() => startPreview(handlePreview)}
          data-testid="bbp-preview-btn"
          style={{ minHeight: 40 }}
        >
          {isPreviewing ? "…" : "Preview"}
        </button>
      </div>

      {/* Preview error */}
      {previewErr && (
        <p role="alert" style={{ color: "var(--danger)", marginBottom: "var(--space-3)", fontSize: "var(--text-xs)" }}>
          {previewErr}
        </p>
      )}

      {/* Preview results */}
      {preview && (
        <div data-testid="bbp-preview-results" style={{ marginBottom: "var(--space-4)" }}>
          <p className="t-muted" style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-xs)" }}>
            {preview.alreadyHave} employee(s) already have a {year} period (unchanged).
          </p>

          {preview.eligible.length === 0 && preview.skipped.length === 0 ? (
            <p className="t-muted">No eligible employees — nothing to create.</p>
          ) : (
            <>
              {preview.eligible.length > 0 && (
                <div className="table-scroll" style={{ marginBottom: "var(--space-3)" }}>
                  <table className="table" data-testid="bbp-eligible-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>Proposed opening (days)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.eligible.map((r) => (
                        <tr key={r.employeeId}>
                          <td>{r.name}</td>
                          <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{r.proposedOpening}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {preview.skipped.length > 0 && (
                <details style={{ marginBottom: "var(--space-3)" }} data-testid="bbp-skipped-details">
                  <summary className="t-label" style={{ cursor: "pointer" }}>
                    {preview.skipped.length} skipped (will not be created)
                  </summary>
                  <div className="table-scroll" style={{ marginTop: "var(--space-2)" }}>
                    <table className="table" data-testid="bbp-skipped-table">
                      <thead><tr><th>Employee</th><th>Reason</th></tr></thead>
                      <tbody>
                        {preview.skipped.map((r) => (
                          <tr key={r.employeeId}>
                            <td>{r.name}</td>
                            <td className="t-muted">{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {/* Apply form — Preview IS the confirmation step; Apply button commits. */}
              {preview.eligible.length > 0 && (
                <form action={applyAction}>
                  <input type="hidden" name="departmentId" value={departmentId} />
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="mode" value={mode} />
                  {mode === "FIXED" && <input type="hidden" name="fixedValue" value={fixedValue} />}
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={pending}
                    aria-disabled={pending}
                    data-testid="bbp-apply-btn"
                    style={{ minHeight: 40 }}
                  >
                    {pending ? "…" : `Apply — create ${preview.eligible.length} period(s)`}
                  </button>
                  {state && (
                    <span
                      role={state.ok ? "status" : "alert"}
                      style={{ marginLeft: "var(--space-3)", fontSize: "var(--text-xs)", color: state.ok ? "var(--success)" : "var(--danger)" }}
                      data-testid="bbp-apply-result"
                    >
                      {state.message}
                    </span>
                  )}
                </form>
              )}
            </>
          )}
        </div>
      )}
      {/* Show action result even without preview (e.g. after page refresh) */}
      {state && !preview && (
        <span
          role={state.ok ? "status" : "alert"}
          style={{ fontSize: "var(--text-xs)", color: state.ok ? "var(--success)" : "var(--danger)" }}
          data-testid="bbp-apply-result"
        >
          {state.message}
        </span>
      )}
    </div>
  );
}
