import { getRequestContext } from "@/lib/leave";
import { requireUser } from "@/lib/rbac";
import RequestForm from "./RequestForm";

export default async function RequestPage() {
  const actor = await requireUser();
  const ctx = await getRequestContext(actor.employeeId);

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Request leave</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
        Choose the details, check the impact on your allowance, then submit for approval.
      </p>
      <RequestForm
        leaveTypes={ctx.leaveTypes}
        regionName={ctx.regionName}
        available={ctx.balance?.available ?? null}
        hasPeriod={ctx.balance !== null}
      />
    </div>
  );
}
