"use server";

import { revalidatePath } from "next/cache";
import { isHR } from "@/core/authz";
import { createStaffRestriction, deleteStaffRestriction } from "@/lib/restrictions";
import { AuthError, requireActor } from "@/lib/rbac";

async function hr() {
  const actor = await requireActor();
  if (!isHR(actor)) throw new AuthError(403, "HR only.");
  return actor;
}

export async function createStaffRestrictionAction(formData: FormData) {
  const actor = await hr();
  await createStaffRestriction(actor.employeeId, {
    employeeAId: String(formData.get("employeeAId")),
    employeeBId: String(formData.get("employeeBId")),
    bidirectional: formData.get("bidirectional") === "on",
    reason: formData.get("reason") ? String(formData.get("reason")) : undefined,
  });
  revalidatePath("/admin");
}

export async function deleteStaffRestrictionAction(formData: FormData) {
  const actor = await hr();
  await deleteStaffRestriction(actor.employeeId, String(formData.get("id")));
  revalidatePath("/admin");
}
