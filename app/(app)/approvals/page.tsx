import { redirect } from "next/navigation";
import { isApprover, isHR } from "@/core/authz";
import { listPendingForApprover } from "@/lib/approvals";
import { requireUser } from "@/lib/rbac";
import ApprovalsList from "./ApprovalsList";

export default async function ApprovalsPage() {
  const actor = await requireUser();
  // Approvers and HR only; everyone else goes back to their dashboard.
  if (!isApprover(actor)) redirect("/dashboard");

  const pending = await listPendingForApprover(actor);

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Approvals</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
        Pending requests awaiting your decision. Approving debits the employee&apos;s allowance.
      </p>
      <ApprovalsList items={pending} isHR={isHR(actor)} />
    </div>
  );
}
