// Per-employee allowance log CSV export (story 31.3). Admin-only — mirrors staff-restrictions export.
import { buildAllowanceLogCsv, getAllowanceLog } from "@/lib/allowance-admin";
import { AuthError, withAuth } from "@/lib/rbac";
import { canAccessAdmin } from "@/core/authz";

export const GET = withAuth(async (req, { actor }) => {
  if (!canAccessAdmin(actor)) throw new AuthError(403, "Insufficient permissions.");
  const employeeId = new URL(req.url).searchParams.get("employeeId");
  if (!employeeId) throw new AuthError(403, "employeeId is required.");
  const rows = await getAllowanceLog(employeeId);
  const csv = buildAllowanceLogCsv(rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="allowance-log-${employeeId}.csv"`,
    },
  });
});
