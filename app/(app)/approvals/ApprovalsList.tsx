"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PendingItem } from "@/lib/approvals";
import { decideAction } from "./actions";

function dateLabel(item: PendingItem) {
  if (item.startISO === item.endISO) return item.startISO;
  return `${item.startISO} → ${item.endISO}`;
}

function Row({ item }: { item: PendingItem }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decide(action: "APPROVE" | "DECLINE") {
    setError(null);
    if (action === "DECLINE" && !comment.trim()) {
      setError("A reason is required to decline.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await decideAction({ requestId: item.id, action, comment: comment.trim() || undefined });
        if (res.ok) router.refresh(); // decided request drops out of the queue
        else setError(res.errors.join(" "));
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
    </section>
  );
}

export default function ApprovalsList({ items }: { items: PendingItem[] }) {
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
        <Row key={item.id} item={item} />
      ))}
    </div>
  );
}
