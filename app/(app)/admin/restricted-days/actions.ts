"use server";

import { revalidatePath } from "next/cache";
import { isHR } from "@/core/authz";
import { createRestrictedDay, deleteRestrictedDay, type RestrictedScope } from "@/lib/calendars";
import { AuthError, requireActor } from "@/lib/rbac";

async function hr() {
  const actor = await requireActor();
  if (!isHR(actor)) throw new AuthError(403, "HR only.");
  return actor;
}

export async function createRestrictedAction(formData: FormData) {
  const actor = await hr();
  const scope = String(formData.get("scope")) as RestrictedScope;
  await createRestrictedDay(actor.employeeId, {
    scope,
    regionId: formData.get("regionId") ? String(formData.get("regionId")) : null,
    departmentId: formData.get("departmentId") ? String(formData.get("departmentId")) : null,
    startISO: String(formData.get("start")),
    endISO: String(formData.get("end")),
    reason: formData.get("reason") ? String(formData.get("reason")) : undefined,
  });
  revalidatePath("/admin/restricted-days");
}

export async function deleteRestrictedAction(formData: FormData) {
  const actor = await hr();
  await deleteRestrictedDay(actor.employeeId, String(formData.get("id")));
  revalidatePath("/admin/restricted-days");
}
