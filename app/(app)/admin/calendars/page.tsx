import { requireRole } from "@/lib/rbac";
import CalendarsSection from "../_sections/CalendarsSection";

export default async function CalendarsPage({ searchParams }: { searchParams: Promise<{ region?: string; year?: string }> }) {
  await requireRole("HR");
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 720 }}>
      <CalendarsSection regionId={sp.region} yearStr={sp.year} formAction="/admin/calendars" />
    </div>
  );
}
