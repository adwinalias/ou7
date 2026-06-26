"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PendingItem } from "@/lib/approvals";
import { decideAction } from "./actions";

function dateLabel(item: PendingItem) {
  if (item.startISO === item.endISO) return item.startISO;
  return `${item.startISO} → ${item.endISO}`;
}

// Story 29.2: Row receives isHR so it can reveal the override input when a clash blocks.
function Row({ item, isHR }: { item: PendingItem; isHR: boolean }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [coverageWarning, setCoverageWarning] = useState<string | null>(null);
  // Story 29.2: clash block state — set when the server returns a clash error.
  const [clashBlock, setClashBlock] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [pending, startTransition] = useTransition();

  function decide(action: "APPROVE" | "DECLINE", override?: string) {
    setError(null);
    setCoverageWarning(null);
    setClashBlock(null);
    if (action === "DECLINE" && !comment.trim()) {
      setError("A reason is required to decline.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await decideAction({
          requestId: item.id,
          action,
          comment: comment.trim() || undefined,
          overrideReason: override?.trim() || undefined,
        });
        if (res.ok) {
          // ADR-0014: surface any coverage breach recorded on the LEAVE_APPROVE audit entry.
          const coverWarn = res.warnings?.find((w) => !w.includes("override")) ?? null;
          if (coverWarn) {
            setCoverageWarning(coverWarn);
          } else {
            router.refresh(); // decided request drops out of the queue
          }
        } else {
          // Story 29.2: distinguish clash block (contains "same time") from other errors.
          const msg = res.errors.join(" ");
          const isClash = /same time/i.test(msg) || /shared working day/i.test(msg);
          if (isClash) {
            setClashBlock(msg);
          } else {
            setError(msg);
          }
        }
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <section className="card" style={{ padding: "var(--space-5)" }} data-testid="approval-card">
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-4)" }}>
        <div>
          <div className="t-h3">{item.requesterName}</div>
          <div className="t-muted" style={{ fontSize: "var(--text-sm)" }}>
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                marginRight: 6,
                background: item.leaveTypeColor,
                verticalAlign: "middle",
              }}
            />
            {item.leaveTypeName}
          </div>
        </div>
        <div className="t-num" style={{ textAlign: "right", fontSize: "var(--text-sm)" }}>
          <div>{dateLabel(item)}</div>
          <div className="t-muted">
            {item.workingDays} working day(s)
            {item.deductsAllowance ? ` · −${item.allowanceDays} allowance` : " · no allowance impact"}
          </div>
        </div>
      </div>

      {item.notes && (
        <p className="t-muted" style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)" }}>
          “{item.notes}”
        </p>
      )}

      <div style={{ marginTop: "var(--space-4)" }}>
        <label htmlFor={`comment-${item.id}`} className="t-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>
          Comment (required to decline)
        </label>
        <textarea
          id={`comment-${item.id}`}
          className="input"
          style={{ width: "100%", minHeight: 56, resize: "vertical" }}
          data-testid="decision-comment"
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? `comment-error-${item.id}` : undefined}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setError(null);
          }}
        />
      </div>

      {error && (
        <div
          id={`comment-error-${item.id}`}
          role="alert"
          style={{
            marginTop: "var(--space-3)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderLeft: "3px solid var(--danger)",
            padding: "var(--space-3) var(--space-4)",
          }}
        >
          {error}
        </div>
      )}

      {/* ADR-0014: advisory coverage breach recorded on LEAVE_APPROVE audit. */}
      {coverageWarning && (
        <div
          role="status"
          style={{
            marginTop: "var(--space-3)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderLeft: "3px solid var(--warning)",
            padding: "var(--space-3) var(--space-4)",
            color: "var(--text)",
          }}
        >
          <strong>Approved — staffing notice:</strong> {coverageWarning} The breach has been recorded in the audit log.{" "}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: "var(--space-2)" }}
            onClick={() => router.refresh()}
          >
            Continue
          </button>
        </div>
      )}

      {/* Story 29.2: clash hard block with HR-only override path. */}
      {clashBlock && (
        <div
          role="alert"
          style={{
            marginTop: "var(--space-3)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderLeft: "3px solid var(--danger)",
            padding: "var(--space-3) var(--space-4)",
            color: "var(--text)",
          }}
        >
          <strong>Clash — approval blocked:</strong> {clashBlock}
          {isHR && (
            <div style={{ marginTop: "var(--space-3)" }}>
              <label
                htmlFor={`override-${item.id}`}
                className="t-label"
                style={{ display: "block", marginBottom: "var(--space-1)" }}
              >
                Override reason (HR only, required to approve anyway)
              </label>
              <textarea
                id={`override-${item.id}`}
                className="input"
                style={{ width: "100%", minHeight: 48, resize: "vertical" }}
                data-testid="override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                aria-required="true"
              />
              <button
                type="button"
                className="btn btn-danger"
                style={{ marginTop: "var(--space-2)" }}
                data-testid="approve-override"
                disabled={pending || !overrideReason.trim()}
                onClick={() => decide("APPROVE", overrideReason)}
              >
                {pending ? "Working…" : "Approve anyway (override)"}
              </button>
            </div>
          )}
        </div>
      )}

      {!coverageWarning && !clashBlock && (
        <div style={{ marginTop: "var(--space-4)", display: "flex", gap: "var(--space-3)" }}>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="approve"
            onClick={() => decide("APPROVE")}
            disabled={pending}
          >
            {pending ? "Working…" : "Approve"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            data-testid="decline"
            onClick={() => decide("DECLINE")}
            disabled={pending}
          >
            Decline
          </button>
        </div>
      )}
    </section>
  );
}

// Story 29.2: isHR controls whether the clash override input is shown.
export default function ApprovalsList({ items, isHR = false }: { items: PendingItem[]; isHR?: boolean }) {
  if (items.length === 0) {
    return (
      <section className="card" style={{ padding: "var(--space-6)", textAlign: "center" }} data-testid="approvals-empty">
        <p className="t-editorial" style={{ fontSize: "var(--text-h2)" }}>Nothing waiting on you.</p>
        <p className="t-muted">Pending requests you can act on will appear here.</p>
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      {items.map((item) => (
        <Row key={item.id} item={item} isHR={isHR} />
      ))}
    </div>
  );
}
