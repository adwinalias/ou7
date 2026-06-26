// Epic 31.2 — Bulk balance prep preview endpoint. HR-only. Read-only (no writes).
import { NextResponse } from "next/server";
import { isHR } from "@/core/authz";
import { previewBulkBalancePrep, type BulkBalancePrepSource } from "@/lib/allowance-admin";
import { requireActor } from "@/lib/rbac";

export async function GET(req: Request) {
  const actor = await requireActor().catch(() => null);
  if (!actor || !isHR(actor)) {
    return NextResponse.json({ error: "HR only." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const deptRaw = searchParams.get("departmentId");
  const departmentId = deptRaw && deptRaw !== "" ? deptRaw : null;
  const mode = searchParams.get("mode") as BulkBalancePrepSource["mode"] | null;

  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "Invalid year." }, { status: 400 });
  }
  if (mode !== "FIXED" && mode !== "COPY_PREVIOUS") {
    return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
  }

  let source: BulkBalancePrepSource;
  if (mode === "FIXED") {
    const value = Number(searchParams.get("fixedValue"));
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: "Fixed value must be a non-negative number." }, { status: 400 });
    }
    source = { mode: "FIXED", value };
  } else {
    source = { mode: "COPY_PREVIOUS" };
  }

  const result = await previewBulkBalancePrep(departmentId, year, source);
  return NextResponse.json(result);
}
