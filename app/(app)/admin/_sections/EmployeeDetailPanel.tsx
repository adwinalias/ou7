import { canAddLeaveForOthers } from "@/core/authz";
import { listCompanyPending } from "@/lib/approvals";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import AddLeaveForm from "../add-leave/AddLeaveForm";
import CompanyQueue from "../pending/CompanyQueue";
import AllowanceSection from "./AllowanceSection";
import EmployeeDetail from "./EmployeeDetail";

const dubaiYear = () => Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }).slice(0, 4));

// Employee-mode detail (Epic 19.3b, AD6/AD7): one inline surface for a selected person —
// editable record (incl. department) with change-safety, their allowance management, their
// pending queue, and add-leave-on-behalf preset to them. Rendered inside /admin which has
// already re-checked HR server-side; on-behalf is additionally permission-gated here.
export default async function EmployeeDetailPanel({ employeeId, year }: { employeeId: string; year?: number }) {
  const actor = await requireUser();
  const y = year ?? dubaiYear();

  const [employee, regions, departments, leaveTypes, pending] = await Promise.all([
    db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, email: true, firstName: true, lastName: true, regionId: true, departmentId: true, approverLevel: true, employmentType: true },
    }),
    db.region.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.leaveType.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listCompanyPending({ employeeId }),
  ]);

  if (!employee) return <p className="t-muted" data-testid="employee-detail-missing">Employee not found.</p>;

  const name = `${employee.firstName} ${employee.lastName}`.trim();

  return (
    <div data-testid="employee-detail-panel" style={{ marginTop: "var(--space-7)" }}>
      <h2 className="t-h1" style={{ fontSize: "var(--text-h2)", marginBottom: "var(--space-4)" }}>{name}</h2>

      <EmployeeDetail
        employee={{
          id: employee.id,
          email: employee.email,
          firstName: employee.firstName,
          lastName: employee.lastName,
          regionId: employee.regionId,
          departmentId: employee.departmentId,
          approverLevel: employee.approverLevel,
          employmentType: employee.employmentType,
        }}
        regions={regions}
        departments={departments}
      />

      <section style={{ marginBottom: "var(--space-6)" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Allowance management ({y})</div>
        <AllowanceSection employeeId={employee.id} year={y} />
      </section>

      <section className="card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-6)" }} data-testid="employee-pending">
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Pending ({pending.length})</div>
        <CompanyQueue items={pending} />
      </section>

      {canAddLeaveForOthers(actor) && (
        <section className="card" style={{ padding: "var(--space-5)" }} data-testid="employee-add-leave">
          <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>Add leave on behalf of {name}</div>
          <p className="t-muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-4)" }}>
            Added as <strong>pending</strong> and runs the same checks (balance, conflicts, restricted days).
          </p>
          {/* Single-element list fixes the request to this person. */}
          <AddLeaveForm employees={[{ id: employee.id, name }]} leaveTypes={leaveTypes} />
        </section>
      )}
    </div>
  );
}
