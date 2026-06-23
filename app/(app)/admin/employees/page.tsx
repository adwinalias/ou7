import { requireRole } from "@/lib/rbac";
import EmployeesSection from "../_sections/EmployeesSection";

export default async function EmployeesPage() {
  await requireRole("HR");
  return (
    <div style={{ maxWidth: 920 }}>
      <EmployeesSection />
    </div>
  );
}
