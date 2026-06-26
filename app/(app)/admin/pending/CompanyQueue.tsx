"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CompanyPendingItem } from "@/lib/approvals";
import { decideAction } from "../../approvals/actions";
import { cancelAction, remindAction } from "./actions";

const num: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

function Row({ item }: { item: CompanyPendingItem }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Story 29.2: clash block + HR override (company queue is HR-only, so always show override).
  const [clashBlock, setClashBlock] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [pending, start] = useTransition();

  function remind() {
    setError(null);
    setNote(null);
    start(async () => {
      const res = await remindAction({ requestId: item.id });
      if (res.ok) setNote(`Reminder sent (${res.followUpCount}×).`);
      else setError(res.error);
    });
  }

  function decide(action: "APPROVE" | "DECLINE", override?: string) {
    setError(null);
    setClashBlock(null);
    if (action === "DECLINE" && !comment.trim()) {
      setError("Reason required to decline.");
      return;
    }
    start(async () => {
      const res = await decideAction({ requestId: item.id, action, comment: comment.trim() || undefined, overrideReason: override?.trim() || undefined });
      if (res.ok) router.refresh();
      else {
        const msg = res.errors.join(" ");
        const isClash = /same time/i.test(msg) || /shared working day/i.test(msg);
        if (isClash) setClashBlock(msg);
        else setError(msg);
      }
    });
  }

  function cancel() {
    setError(null);
    start(async () => {
      const res = await cancelAction({ requestId: item.id });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <tr data-testid="pending-row">
      <td>{item.requesterName}</td>
      <td className="t-muted">{item.departmentName ?? "—"} · {item.regionName}</td>
      <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i aria-hidden style={{ width: 10, height: 10, background: item.leaveTypeColor }} />{item.code}</span></td>
      <td style={num}>{item.startISO === item.endISO ? item.startISO : `${item.startISO}→${item.endISO}`}</td>
      <td style={num}>{item.daysPending}d</td>
      <td>
        {!clashBlock && (
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <input className="input" aria-label={`Reason to decline ${item.requesterName}'s request`} placeholder="reason (to decline)" value={comment} onChange={(e) => { setComment(e.target.value); setError(null); }} style={{ flex: "1 1 140px", minWidth: 120, maxWidth: "100%" }} data-testid="pending-reason" />
            <button className="btn btn-primary" style={{ padding: "2px 10px" }} disabled={pending} onClick={() => decide("APPROVE")} data-testid="pending-approve">Approve</button>
            <button className="btn btn-danger" style={{ padding: "2px 10px" }} disabled={pending} onClick={() => decide("DECLINE")}>Decline</button>
            <button className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={pending} onClick={cancel} data-testid="pending-cancel">Cancel</button>
            <button className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={pending} onClick={remind} data-testid="pending-remind">Remind</button>
          </div>
        )}
        {/* Story 29.2: clash hard block — HR sees override input (company queue is HR-only). */}
        {clashBlock && (
          <div
            role="alert"
            style={{
              borderLeft: "3px solid var(--danger)",
              paddingLeft: "var(--space-3)",
              fontSize: "var(--text-xs)",
            }}
          >
            <strong>Clash blocked:</strong> {clashBlock}
            <div style={{ marginTop: "var(--space-2)" }}>
              <label htmlFor={`cq-override-${item.id}`} className="t-label" style={{ display: "block", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)" }}>
                Override reason (required)
              </label>
              <input
                id={`cq-override-${item.id}`}
                className="input"
                style={{ width: "100%", marginBottom: "var(--space-2)" }}
                data-testid="cq-override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                aria-required="true"
              />
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <button className="btn btn-danger" style={{ padding: "2px 10px" }} disabled={pending || !overrideReason.trim()} onClick={() => decide("APPROVE", overrideReason)} data-testid="cq-approve-override">Approve anyway</button>
                <button className="btn btn-secondary" style={{ padding: "2px 10px" }} disabled={pending} onClick={() => { setClashBlock(null); setOverrideReason(""); }}>Back</button>
              </div>
            </div>
          </div>
        )}
        {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{error}</div>}
        {note && <div role="status" style={{ color: "var(--success)", fontSize: "var(--text-xs)" }} data-testid="remind-note">{note}</div>}
      </td>
    </tr>
  );
}

export default function CompanyQueue({ items }: { items: CompanyPendingItem[] }) {
  if (items.length === 0) return <p className="t-editorial" style={{ fontSize: "var(--text-h2)" }}>No pending requests.</p>;
  return (
    <div className="table-scroll">
      <table className="table" data-testid="company-queue">
        <thead><tr><th>Requester</th><th>Dept · Region</th><th>Type</th><th>Dates</th><th>Pending</th><th>Decision</th></tr></thead>
        <tbody>{items.map((i) => <Row key={i.id} item={i} />)}</tbody>
      </table>
    </div>
  );
}
