// CSV export for staff restrictions (story 29.3). Admin-only — mirrors wall-chart export.
import { buildStaffRestrictionsCsv, listStaffRestrictions } from "@/lib/restrictions";
import { AuthError, withAuth } from "@/lib/rbac";
import { canAccessAdmin } from "@/core/authz";

export const GET = withAuth(async (_req, { actor }) => {
  if (!canAccessAdmin(actor)) throw new AuthError(403, "Insufficient permissions.");
  const rows = await listStaffRestrictions();
  const csv = buildStaffRestrictionsCsv(rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="staff-restrictions.csv"',
    },
  });
});
