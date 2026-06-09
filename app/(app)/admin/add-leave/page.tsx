import { redirect } from "next/navigation";
import { canAddLeaveForOthers } from "@/core/authz";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import AddLeaveForm from "./AddLeaveForm";

export default async function AddLeavePage() {
  const actor = await requireUser();
  // Approvers with +Add (and HR) only — respects the permission level (Epic 9.3 / 2.4).
  if (!canAddLeaveForOthers(actor)) redirect("/dashboard");

  const [employees, leaveTypes] = await Promise.all([
    db.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    db.leaveType.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Add leave on behalf</h1>
      <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
        Create leave for an employee. It&apos;s added as <strong>pending</strong> and runs the same checks
        (balance, conflicts, restricted days); approving it notifies the employee.
      </p>
      <section className="card" style={{ padding: "var(--space-5)" }}>
        <AddLeaveForm
          employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }))}
          leaveTypes={leaveTypes}
        />
      </section>
    </div>
  );
}
