"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { isHR } from "@/core/authz";
import {
  createDepartment,
  createLeaveType,
  createTag,
  deleteEntitlementPolicy,
  setLeaveTypeActive,
  updateLeaveTypePolicy,
  upsertEntitlementPolicy,
} from "@/lib/config";
import { AuthError, requireActor } from "@/lib/rbac";

async function hr() {
  const actor = await requireActor();
  if (!isHR(actor)) throw new AuthError(403, "HR only.");
  return actor;
}

const numOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number(s);
};

export async function upsertPolicyAction(formData: FormData) {
  const actor = await hr();
  await upsertEntitlementPolicy(actor.employeeId, {
    regionId: String(formData.get("regionId")),
    role: String(formData.get("role")) as Role,
    annualDays: Number(formData.get("annualDays")),
    carryOverCapDays: numOrNull(formData.get("carryOverCapDays")),
    carryOverExpiry: formData.get("carryOverExpiry") ? String(formData.get("carryOverExpiry")) : null,
  });
  revalidatePath("/admin/config");
}

export async function deletePolicyAction(formData: FormData) {
  const actor = await hr();
  await deleteEntitlementPolicy(actor.employeeId, String(formData.get("id")));
  revalidatePath("/admin/config");
}

export async function createDepartmentAction(formData: FormData) {
  const actor = await hr();
  await createDepartment(actor.employeeId, String(formData.get("name")));
  revalidatePath("/admin/config");
}

export async function createTagAction(formData: FormData) {
  const actor = await hr();
  await createTag(actor.employeeId, String(formData.get("name")));
  revalidatePath("/admin/config");
}

export async function createLeaveTypeAction(formData: FormData) {
  const actor = await hr();
  const rawNotice = parseInt(String(formData.get("noticePeriodDays") ?? "0"), 10);
  await createLeaveType(actor.employeeId, {
    name: String(formData.get("name")),
    code: String(formData.get("code")),
    color: String(formData.get("color") || "#2F6FEB"),
    deductsAllowance: formData.get("deductsAllowance") === "on",
    paid: formData.get("paid") === "on",
    noteRequired: formData.get("noteRequired") === "on",
    requiresApproval: formData.get("requiresApproval") === "on",
    noticePeriodDays: isNaN(rawNotice) ? 0 : rawNotice,
  });
  revalidatePath("/admin/config");
}

export async function setLeaveTypeActiveAction(formData: FormData) {
  const actor = await hr();
  await setLeaveTypeActive(actor.employeeId, String(formData.get("id")), formData.get("active") === "true");
  revalidatePath("/admin/config");
}

export async function updateLeaveTypePolicyAction(formData: FormData) {
  const actor = await hr();
  const rawNotice = formData.has("noticePeriodDays")
    ? parseInt(String(formData.get("noticePeriodDays")), 10)
    : undefined;
  await updateLeaveTypePolicy(actor.employeeId, String(formData.get("id")), {
    requiresApproval: formData.get("requiresApproval") === "on",
    ...(rawNotice !== undefined ? { noticePeriodDays: isNaN(rawNotice) ? 0 : rawNotice } : {}),
  });
  revalidatePath("/admin/config");
}
