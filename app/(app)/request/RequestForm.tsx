"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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

// One grouped impact row: label on the left, value on the right, hairline-separated.
function ImpactRow({ label, value, testid }: { label: string; value: number | null; testid?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "var(--space-4)",
        paddingBottom: "var(--space-3)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <dt className="t-muted" style={{ margin: 0 }}>{label}</dt>
      <dd className="t-num" style={{ margin: 0, textAlign: "right" }} data-testid={testid}>{value}</dd>
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
  // R1/R2: no leave type pre-selected — the user must explicitly pick one.
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [mode, setMode] = useState<Mode>("DAY");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDayPeriod, setHalfDayPeriod] = useState<"AM" | "PM">("AM");
  const [notes, setNotes] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedType = useMemo(() => leaveTypes.find((t) => t.id === leaveTypeId), [leaveTypes, leaveTypeId]);

  // Any edit clears the stale preview/errors; the debounced effect recomputes.
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

  // R6: live allowance-impact preview. Recompute (debounced) whenever the inputs
  // needed for a preview are present — no manual "Check details" click required.
  // attachmentUrl IS a dependency: for a type whose document is required beyond its
  // threshold the preview is not `ok` until the URL is supplied, so providing it must
  // re-validate and unblock Submit. The 350ms debounce absorbs per-keystroke churn
  // (no loop — the effect never writes attachmentUrl).
  const canPreview = !!leaveTypeId && !!startDate && (mode !== "MULTI" || !!endDate);
  useEffect(() => {
    if (!canPreview) {
      setPreview(null);
      setPreviewing(false); // never leave a stuck "Updating…" / aria-busy state
      return;
    }
    let cancelled = false;
    setActionError(null);
    setPreviewing(true);
    const timer = setTimeout(() => {
      previewAction(buildInput())
        .then((res) => {
          if (!cancelled) setPreview(res);
        })
        .catch(() => {
          if (!cancelled) {
            setPreview(null);
            setActionError("Couldn't check the details. Please try again.");
          }
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPreview, leaveTypeId, mode, startDate, endDate, halfDayPeriod, notes, attachmentUrl]);

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

  // R4: the supporting-document field is conditional. It appears only when the
  // live preview's working days exceed the selected type's threshold — so a single
  // full-day or a half-day never shows it. Visibility is driven off the accurate,
  // region-calendar-derived workingDays from the server preview.
  const showAttachment =
    !!selectedType?.attachmentRequired &&
    selectedType.attachmentThresholdDays != null &&
    preview != null &&
    preview.workingDays > selectedType.attachmentThresholdDays;

  const attachmentHint =
    selectedType?.attachmentThresholdDays != null
      ? `Required for requests longer than ${selectedType.attachmentThresholdDays} working day(s).`
      : "Required for this leave type.";

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
            aria-required="true"
          >
            <option value="">Select a leave type…</option>
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
                <option value="AM">Morning (first half) (AM)</option>
                <option value="PM">Afternoon (second half) (PM)</option>
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

        {showAttachment && (
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
              onChange={(e) => setAttachmentUrl(e.target.value)}
              aria-describedby="attachment-hint"
            />
            <p id="attachment-hint" className="t-muted" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>{attachmentHint}</p>
          </div>
        )}
      </section>

      {/* Step 2 — live allowance impact (auto-updates; no manual check needed) */}
      {(preview || previewing) && (
        <section className="card" style={{ padding: "var(--space-5)" }} data-testid="preview" aria-busy={previewing}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-4)", gap: "var(--space-3)" }}>
            <div className="t-label">2 · Impact</div>
            {previewing && <span className="t-muted" style={{ fontSize: "var(--text-sm)" }}>Updating…</span>}
          </div>

          {/* Recomputing: keep the panel but show nothing stale until the result lands. */}
          {!preview ? (
            <p className="t-muted" style={{ fontSize: "var(--text-sm)", margin: 0 }} aria-live="polite">Calculating impact…</p>
          ) : (
            <>
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

              {/* R6: grouped, spaced rows — each row is a label/value pair separated by a hairline. */}
              <dl style={{ display: "grid", gap: "var(--space-3)", margin: "var(--space-4) 0 0" }}>
                <ImpactRow label="Working days" value={preview.workingDays} testid="working-days" />
                <ImpactRow label="Weekend/holiday" value={preview.freeDays} />
                {preview.deductsAllowance && (
                  <>
                    <ImpactRow label="Available now" value={preview.availableBefore} />
                    <ImpactRow label="Available after request" value={preview.availableAfter} />
                  </>
                )}
              </dl>

              <div style={{ marginTop: "var(--space-5)" }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="submit-request"
                  onClick={onSubmit}
                  disabled={pending || previewing || !leaveTypeId || !preview.ok}
                >
                  {pending ? "Submitting…" : "Submit request"}
                </button>
              </div>
            </>
          )}
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
