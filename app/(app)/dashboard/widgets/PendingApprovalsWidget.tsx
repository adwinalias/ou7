// Role-gated "Pending approvals (N)" widget (Epic 18.3; streamed per 21.2). Only ever
// mounted for approvers/HR (the page omits it entirely otherwise — AC4). Awaits its own
// count, which shares its WHERE with the /approvals queue so the number matches exactly.
// Markup/testids (dash-pending-count / dash-pending-link) kept.
import Link from "next/link";
import type { Actor } from "@/core/types";
import { cachedCountPending } from "./data";

export default async function PendingApprovalsWidget({ actor }: { actor: Actor }) {
  const pendingCount = await cachedCountPending(actor);
  return (
    <>
      <div className="t-label">Pending approvals</div>
      <p
        className="t-muted"
        style={{ marginTop: 8, marginBottom: "var(--space-4)", fontSize: "var(--text-sm)" }}
        data-testid="dash-pending-count"
      >
        {pendingCount === 0 ? (
          "No requests are waiting for you."
        ) : (
          <>
            <span className="t-num">{pendingCount}</span> request{pendingCount === 1 ? "" : "s"}{" "}
            {pendingCount === 1 ? "is" : "are"} waiting for your decision.
          </>
        )}
      </p>
      <Link
        className="btn btn-secondary"
        href="/approvals"
        data-testid="dash-pending-link"
        style={{ minHeight: 40, display: "inline-flex", alignItems: "center" }}
      >
        {pendingCount === 0 ? "No pending approvals" : `Pending approvals (${pendingCount})`}
      </Link>
    </>
  );
}
