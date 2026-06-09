"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CompanyPendingItem } from "@/lib/approvals";
import { decideAction } from "../../approvals/actions";

const num: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

function Row({ item }: { item: CompanyPendingItem }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function decide(action: "APPROVE" | "DECLINE") {
    setError(null);
    if (action === "DECLINE" && !comment.trim()) {
      setError("Reason required to decline.");
      return;
    }
    start(async () => {
      const res = await decideAction({ requestId: item.id, action, comment: comment.trim() || undefined });
      if (res.ok) router.refresh();
      else setError(res.errors.join(" "));
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
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <input className="input" placeholder="reason (to decline)" value={comment} onChange={(e) => { setComment(e.target.value); setError(null); }} style={{ width: 150 }} data-testid="pending-reason" />
          <button className="btn btn-primary" style={{ padding: "2px 10px" }} disabled={pending} onClick={() => decide("APPROVE")} data-testid="pending-approve">Approve</button>
          <button className="btn btn-danger" style={{ padding: "2px 10px" }} disabled={pending} onClick={() => decide("DECLINE")}>Decline</button>
        </div>
        {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{error}</div>}
      </td>
    </tr>
  );
}

export default function CompanyQueue({ items }: { items: CompanyPendingItem[] }) {
  if (items.length === 0) return <p className="t-editorial" style={{ fontSize: "var(--text-h2)" }}>No pending requests.</p>;
  return (
    <table className="table" data-testid="company-queue">
      <thead><tr><th>Requester</th><th>Dept · Region</th><th>Type</th><th>Dates</th><th>Pending</th><th>Decision</th></tr></thead>
      <tbody>{items.map((i) => <Row key={i.id} item={i} />)}</tbody>
    </table>
  );
}
