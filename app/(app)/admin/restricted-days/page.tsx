import { requireRole } from "@/lib/rbac";
import RestrictedDaysSection from "../_sections/RestrictedDaysSection";

export default async function RestrictedDaysPage() {
  await requireRole("HR");
  return (
    <div style={{ maxWidth: 760 }}>
      <RestrictedDaysSection />
    </div>
  );
}
