import { requireRole } from "@/lib/rbac";
import ConfigSection from "../_sections/ConfigSection";

export default async function ConfigPage() {
  await requireRole("HR");
  return (
    <div style={{ maxWidth: 820 }}>
      <ConfigSection />
    </div>
  );
}
