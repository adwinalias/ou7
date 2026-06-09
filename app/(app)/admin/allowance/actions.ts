"use server";

import { revalidatePath } from "next/cache";
import type { AdjustmentKind } from "@prisma/client";
import { isHR } from "@/core/authz";
import { addLedgerEntry, resetBalance } from "@/lib/allowance-admin";
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

export async function setHolidayAction(formData: FormData) {
  const actor = await hr();
  await setHolidayBalance(actor.employeeId, String(formData.get("employeeId")), Number(formData.get("year")), Number(formData.get("days")));
  revalidatePath("/admin/allowance");
}
