"use server";

import { revalidatePath } from "next/cache";
import type { HRLogType } from "@prisma/client";
import { isHR } from "@/core/authz";
import { createHRLog, deleteHRLog } from "@/lib/hrlogs";
import { AuthError, requireActor } from "@/lib/rbac";

async function hr() {
  const actor = await requireActor();
  if (!isHR(actor)) throw new AuthError(403, "HR only.");
  return actor;
}

export type HRLogState = { ok: boolean; message: string } | null;

export async function createHRLogAction(_prev: HRLogState, formData: FormData): Promise<HRLogState> {
  const actor = await hr();
  const res = await createHRLog(actor.employeeId, {
    employeeId: String(formData.get("employeeId")),
    type: String(formData.get("type")) as HRLogType,
    startISO: String(formData.get("start")),
    endISO: String(formData.get("end")),
    notes: formData.get("notes") ? String(formData.get("notes")) : undefined,
  });
  revalidatePath("/admin/hr-logs");
  return res.ok ? { ok: true, message: "Logged." } : { ok: false, message: res.error ?? "Failed." };
}

export async function deleteHRLogAction(formData: FormData) {
  const actor = await hr();
  await deleteHRLog(actor.employeeId, String(formData.get("id")));
  revalidatePath("/admin/hr-logs");
}
