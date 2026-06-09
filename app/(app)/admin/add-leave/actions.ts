"use server";

import { revalidatePath } from "next/cache";
import { canAddLeaveForOthers } from "@/core/authz";
import { addLeaveOnBehalf, type LeaveInput } from "@/lib/leave";
import { AuthError, requireActor } from "@/lib/rbac";

export type AddLeaveState = { ok: boolean; message: string } | null;

export async function addLeaveAction(_prev: AddLeaveState, formData: FormData): Promise<AddLeaveState> {
  const actor = await requireActor();
  if (!canAddLeaveForOthers(actor)) throw new AuthError(403, "Not permitted.");

  const mode = String(formData.get("mode")) as LeaveInput["mode"];
  const input: LeaveInput = {
    leaveTypeId: String(formData.get("leaveTypeId")),
    mode,
    startDate: String(formData.get("startDate")),
    endDate: mode === "MULTI" ? String(formData.get("endDate") || "") : undefined,
    halfDayPeriod: mode === "HALF" ? (String(formData.get("halfDayPeriod")) as "AM" | "PM") : undefined,
    notes: formData.get("notes") ? String(formData.get("notes")) : undefined,
    attachmentUrl: "",
  };

  const res = await addLeaveOnBehalf(actor, String(formData.get("employeeId")), input);
  revalidatePath("/admin/add-leave");
  return res.ok ? { ok: true, message: "Leave added as pending." } : { ok: false, message: res.errors.join(" ") };
}
