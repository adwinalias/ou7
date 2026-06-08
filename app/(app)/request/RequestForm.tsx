"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { LeaveInput, LeaveTypeOption, PreviewResult } from "@/lib/leave";
import { previewAction, submitAction } from "./actions";

type Mode = "DAY" | "HALF" | "MULTI";
const MODES: { value: Mode; label: string }[] = [
  { value: "DAY", label: "All day" },
  { value: "HALF", label: "Half day" },
  { value: "MULTI", label: "Multi-day" },
];

// Flat inline alert per DESIGN-SYSTEM §5: surface + hairline + 3px coloured left edge.
function Alert({ tone, children }: { tone: "danger" | "success"; children: React.ReactNode }) {
  const color = tone === "danger" ? "var(--danger)" : "var(--success)";
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${color}`,
        padding: "var(--space-3) var(--space-4)",
        color: "var(--text)",
      }}
    >
      {children}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", marginBottom: "var(--space-1)" };
const fieldStyle: React.CSSProperties = { marginBottom: "var(--space-4)" };

export default function RequestForm({
  leaveTypes,
  regionName,
  available,
  hasPeriod,
}: {
  leaveTypes: LeaveTypeOption[];
  regionName: string;
  available: number | null;
  hasPeriod: boolean;
}) {
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("DAY");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDayPeriod, setHalfDayPeriod] = useState<"AM" | "PM">("AM");
  const [notes, setNotes] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedType = useMemo(() => leaveTypes.find((t) => t.id === leaveTypeId), [leaveTypes, leaveTypeId]);

  // Any edit invalidates a prior preview — you must re-check before submitting.
  function changed<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPreview(null);
      setActionError(null);
    };
  }

  function buildInput(): LeaveInput {
    return {
      leaveTypeId,
      mode,
      startDate,
      endDate: mode === "MULTI" ? endDate : undefined,
      halfDayPeriod: mode === "HALF" ? halfDayPeriod : undefined,
      notes: notes.trim() || undefined,
      attachmentUrl: attachmentUrl.trim() || "",
    };
  }

  function onCheck() {
    setActionError(null);
    startTransition(async () => {
      try {
        setPreview(await previewAction(buildInput()));
      } catch {
        setActionError("Couldn't check the details. Please try again.");
      }
    });
  }

  function onSubmit() {
    setActionError(null);
    startTransition(async () => {
      try {
        const res = await submitAction(buildInput());
        if (res.ok) setSubmittedId(res.id);
        else setPreview((p) => (p ? { ...p, ok: false, errors: res.errors } : p));
      } catch {
        setActionError("Couldn't submit the request. Please try again.");
      }
    });
  }

  if (submittedId) {
    return (
      <section className="card" style={{ padding: "var(--space-6)" }} data-testid="submit-success">
        <span className="pill pill-pending" style={{ marginBottom: "var(--space-4)" }}>Pending</span>
        <h2 className="t-h2" style={{ margin: "var(--space-3) 0 var(--space-2)" }}>Request submitted</h2>
        <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
          Your request is awaiting approval. Your allowance is shown as pending until it&apos;s approved.
        </p>
        <Link className="btn btn-primary" href="/my-leave">View my leave</Link>
      </section>
    );
  }

  const attachmentHint = selectedType?.attachmentRequired
    ? selectedType.attachmentThresholdDays != null
      ? `Required for more than ${selectedType.attachmentThresholdDays} day(s).`
      : "Required for this leave type."
    : null;

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      {/* Step 1 — details */}
      <section className="card" style={{ padding: "var(--space-5)" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>1 · Details</div>

        <div style={fieldStyle}>
          <label htmlFor="leaveType" style={labelStyle}>Leave type</label>
          <select
            id="leaveType"
            className="input"
            style={{ width: "100%" }}
            data-testid="leave-type"
            value={leaveTypeId}
            onChange={(e) => changed(setLeaveTypeId)(e.target.value)}
          >
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <fieldset style={{ ...fieldStyle, border: 0, padding: 0, margin: 0 }}>
          <legend style={labelStyle}>Duration</legend>
          <div role="radiogroup" aria-label="Duration" style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {MODES.map((m) => {
              const active = mode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={active ? "btn btn-primary" : "btn btn-secondary"}
                  onClick={() => changed<Mode>(setMode)(m.value)}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <div style={{ ...fieldStyle, flex: "1 1 200px" }}>
            <label htmlFor="startDate" style={labelStyle}>{mode === "MULTI" ? "Start date" : "Date"}</label>
            <input
              id="startDate"
              type="date"
              className="input t-num"
              style={{ width: "100%" }}
              data-testid="start-date"
              value={startDate}
              onChange={(e) => changed(setStartDate)(e.target.value)}
            />
          </div>

          {mode === "MULTI" && (
            <div style={{ ...fieldStyle, flex: "1 1 200px" }}>
              <label htmlFor="endDate" style={labelStyle}>End date</label>
              <input
                id="endDate"
                type="date"
                className="input t-num"
                style={{ width: "100%" }}
                data-testid="end-date"
                value={endDate}
                onChange={(e) => changed(setEndDate)(e.target.value)}
              />
            </div>
          )}

          {mode === "HALF" && (
            <div style={{ ...fieldStyle, flex: "1 1 200px" }}>
              <label htmlFor="half" style={labelStyle}>Morning / afternoon</label>
              <select
                id="half"
                className="input"
                style={{ width: "100%" }}
                value={halfDayPeriod}
                onChange={(e) => changed<"AM" | "PM">(setHalfDayPeriod)(e.target.value as "AM" | "PM")}
              >
                <option value="AM">Morning (AM)</option>
                <option value="PM">Afternoon (PM)</option>
              </select>
            </div>
          )}
        </div>

        <div style={fieldStyle}>
          <label htmlFor="notes" style={labelStyle}>
            Notes {selectedType?.noteRequired && <span style={{ color: "var(--danger)" }}>(required)</span>}
          </label>
          <textarea
            id="notes"
            className="input"
            style={{ width: "100%", minHeight: 72, resize: "vertical" }}
            data-testid="notes"
            value={notes}
            onChange={(e) => changed(setNotes)(e.target.value)}
          />
        </div>

        {selectedType?.attachmentRequired && (
          <div style={fieldStyle}>
            <label htmlFor="attachment" style={labelStyle}>
              Supporting document URL <span style={{ color: "var(--danger)" }}>(required)</span>
            </label>
            <input
              id="attachment"
              type="url"
              className="input"
              style={{ width: "100%" }}
              placeholder="https://…"
              value={attachmentUrl}
              onChange={(e) => changed(setAttachmentUrl)(e.target.value)}
            />
            {attachmentHint && <p className="t-muted" style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>{attachmentHint}</p>}
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary"
          data-testid="check-details"
          onClick={onCheck}
          disabled={pending || !leaveTypeId || !startDate}
        >
          {pending && !preview ? "Checking…" : "Check details"}
        </button>
      </section>

      {/* Step 2 — check details */}
      {preview && (
        <section className="card" style={{ padding: "var(--space-5)" }} data-testid="preview">
          <div className="t-label" style={{ marginBottom: "var(--space-4)" }}>2 · Check details</div>

          {preview.errors.length > 0 ? (
            <Alert tone="danger">
              <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
                {preview.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          ) : (
            <Alert tone="success">
              <strong className="t-num">{preview.allowanceDays}</strong> day(s) will be removed on approval.
            </Alert>
          )}

          <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-2) var(--space-4)", margin: "var(--space-4) 0 0" }}>
            <dt className="t-muted">Working days</dt>
            <dd className="t-num" style={{ margin: 0, textAlign: "right" }} data-testid="working-days">{preview.workingDays}</dd>
            <dt className="t-muted">Free days (weekend/holiday)</dt>
            <dd className="t-num" style={{ margin: 0, textAlign: "right" }}>{preview.freeDays}</dd>
            {preview.deductsAllowance && (
              <>
                <dt className="t-muted">Available now</dt>
                <dd className="t-num" style={{ margin: 0, textAlign: "right" }}>{preview.availableBefore}</dd>
                <dt className="t-muted">Available after approval</dt>
                <dd className="t-num" style={{ margin: 0, textAlign: "right" }}>{preview.availableAfter}</dd>
              </>
            )}
          </dl>

          <div style={{ marginTop: "var(--space-5)", display: "flex", gap: "var(--space-3)" }}>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="submit-request"
              onClick={onSubmit}
              disabled={pending || !preview.ok}
            >
              {pending ? "Submitting…" : "Submit request"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onCheck} disabled={pending}>
              Re-check
            </button>
          </div>
        </section>
      )}

      {actionError && <Alert tone="danger">{actionError}</Alert>}

      {!hasPeriod && (
        <p className="t-muted" style={{ fontSize: "var(--text-sm)" }}>
          Region: {regionName}. Allowance-deducting leave needs an allowance period — contact HR if you don&apos;t have one.
        </p>
      )}
      {hasPeriod && available !== null && (
        <p className="t-muted" style={{ fontSize: "var(--text-sm)" }}>
          Region: {regionName} · <span className="t-num">{available}</span> day(s) available.
        </p>
      )}
    </div>
  );
}
