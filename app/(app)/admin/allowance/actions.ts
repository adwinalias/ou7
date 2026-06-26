"use server";

import { revalidatePath } from "next/cache";
import type { AdjustmentKind, AllowanceBucket } from "@prisma/client";
import { isHR } from "@/core/authz";
import { addLedgerEntry, resetBalance, rolloverYear, setRemaining } from "@/lib/allowance-admin";
import { setHolidayBalance } from "@/lib/holiday-balance";
import { AuthError, requireActor } from "@/lib/rbac";

async function hr() {
  const actor = await requireActor();
  if (!isHR(actor)) throw new AuthError(403, "HR only.");
  return actor;
}

export type EntryState = { ok: boolean; message: string } | null;

export async function addEntryAction(_prev: EntryState, formData: FormData): Promise<EntryState> {
  const actor = await hr();
  const res = await addLedgerEntry(actor.employeeId, String(formData.get("periodId")), {
    kind: String(formData.get("kind")) as AdjustmentKind,
    bucket: String(formData.get("bucket")) as AllowanceBucket,
    delta: Number(formData.get("delta")),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath("/admin/allowance");
  if (res.ok) return { ok: true, message: res.warning ?? "Applied." };
  return { ok: false, message: res.error };
}

export async function resetAction(formData: FormData) {
  const actor = await hr();
  await resetBalance(actor.employeeId, String(formData.get("employeeId")), Number(formData.get("year")));
  revalidatePath("/admin/allowance");
}

// Year rollover (Epic 24.1 / ADR-0013). HR-only; the visible Admin trigger is Epic 24.2.
export async function rolloverYearAction(formData: FormData) {
  const actor = await hr();
  await rolloverYear(actor.employeeId, String(formData.get("employeeId")), Number(formData.get("fromYear")));
  revalidatePath("/admin/allowance");
}

export async function setRemainingAction(_prev: EntryState, formData: FormData): Promise<EntryState> {
  const actor = await hr();
  // Trust boundary: distinguish a blank field from an intended 0. Number("") is 0, which would
  // silently set Remaining to 0 on a direct (non-UI) POST — require an explicit numeric target.
  const rawTarget = formData.get("target");
  if (rawTarget == null || String(rawTarget).trim() === "") {
    return { ok: false, message: "Enter a target remaining." };
  }
  const target = Number(rawTarget);
  if (!Number.isFinite(target)) {
    return { ok: false, message: "Target must be a number." };
  }
  const res = await setRemaining(
    actor.employeeId,
    String(formData.get("periodId")),
    target,
    String(formData.get("reason") ?? ""),
  );
  revalidatePath("/admin/allowance");
  if (res.ok) return { ok: true, message: "noOp" in res ? res.message : (("warning" in res ? res.warning : undefined) ?? "Applied.") };
  return { ok: false, message: res.error };
}

export async function setHolidayAction(formData: FormData) {
  const actor = await hr();
  await setHolidayBalance(actor.employeeId, String(formData.get("employeeId")), Number(formData.get("year")), Number(formData.get("days")));
  revalidatePath("/admin/allowance");
}
