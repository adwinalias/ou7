"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { isHR } from "@/core/authz";
import {
  createDepartment,
  createLeaveType,
  createTag,
  deleteEntitlementPolicy,
  setDepartmentCoverage,
  setLeaveTypeActive,
  setTagArchived,
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

// positive int ≥ 1 → value; blank / 0 / negative / NaN → null (no limit)
const limitOrNull = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  return isNaN(n) || n <= 0 ? null : n;
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

export async function setDepartmentCoverageAction(formData: FormData) {
  const actor = await hr();
  await setDepartmentCoverage(actor.employeeId, String(formData.get("id")), {
    minStaffing: limitOrNull(formData.get("minStaffing")),
    maxLeavePerDay: limitOrNull(formData.get("maxLeavePerDay")),
  });
  revalidatePath("/admin/config");
}

export async function createTagAction(formData: FormData) {
  const actor = await hr();
  await createTag(actor.employeeId, String(formData.get("name")));
  revalidatePath("/admin/config");
}

export async function setTagArchivedAction(formData: FormData) {
  const actor = await hr();
  await setTagArchived(actor.employeeId, String(formData.get("id")), formData.get("archived") === "true");
  revalidatePath("/admin/config");
}

export async function createLeaveTypeAction(formData: FormData) {
  const actor = await hr();
  const rawNotice = parseInt(String(formData.get("noticePeriodDays") ?? "0"), 10);
  const rawWindow = parseInt(String(formData.get("cancellationWindowDays") ?? "0"), 10);
  await createLeaveType(actor.employeeId, {
    name: String(formData.get("name")),
    code: String(formData.get("code")),
    color: String(formData.get("color") || "#2F6FEB"),
    deductsAllowance: formData.get("deductsAllowance") === "on",
    paid: formData.get("paid") === "on",
    noteRequired: formData.get("noteRequired") === "on",
    requiresApproval: formData.get("requiresApproval") === "on",
    noticePeriodDays: isNaN(rawNotice) ? 0 : rawNotice,
    cancellationWindowDays: isNaN(rawWindow) ? 0 : Math.max(0, rawWindow),
    minLengthDays: limitOrNull(formData.get("minLengthDays")),
    maxConsecutiveDays: limitOrNull(formData.get("maxConsecutiveDays")),
    allowConsecutive: formData.get("allowConsecutive") === "on",
    visibility: (String(formData.get("visibility") || "EVERYONE")) as import("@/core/authz").LeaveTypeVisibility,
    emailOnRequest: (String(formData.get("emailOnRequest") || "STAFF_AND_APPROVER")) as import("@prisma/client").EmailRecipients,
    emailOnDecision: (String(formData.get("emailOnDecision") || "STAFF")) as import("@prisma/client").EmailRecipients,
    emailOnCancellation: (String(formData.get("emailOnCancellation") || "STAFF_AND_APPROVER")) as import("@prisma/client").EmailRecipients,
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
  const rawWindow = formData.has("cancellationWindowDays")
    ? parseInt(String(formData.get("cancellationWindowDays")), 10)
    : undefined;
  await updateLeaveTypePolicy(actor.employeeId, String(formData.get("id")), {
    requiresApproval: formData.get("requiresApproval") === "on",
    ...(rawNotice !== undefined ? { noticePeriodDays: isNaN(rawNotice) ? 0 : rawNotice } : {}),
    ...(rawWindow !== undefined ? { cancellationWindowDays: isNaN(rawWindow) ? 0 : Math.max(0, rawWindow) } : {}),
    // present (even empty) ⇒ include in patch so HR can clear a limit back to null
    ...(formData.has("minLengthDays") ? { minLengthDays: limitOrNull(formData.get("minLengthDays")) } : {}),
    ...(formData.has("maxConsecutiveDays") ? { maxConsecutiveDays: limitOrNull(formData.get("maxConsecutiveDays")) } : {}),
    // allowConsecutive: checkbox present = checked (true), absent = unchecked (false)
    allowConsecutive: formData.get("allowConsecutive") === "on",
    ...(formData.has("visibility") ? { visibility: (String(formData.get("visibility") || "EVERYONE")) as import("@/core/authz").LeaveTypeVisibility } : {}),
    // Story 27.3: email matrix — present in the per-type policy form → include in patch
    ...(formData.has("emailOnRequest") ? { emailOnRequest: (String(formData.get("emailOnRequest") || "STAFF_AND_APPROVER")) as import("@prisma/client").EmailRecipients } : {}),
    ...(formData.has("emailOnDecision") ? { emailOnDecision: (String(formData.get("emailOnDecision") || "STAFF")) as import("@prisma/client").EmailRecipients } : {}),
    ...(formData.has("emailOnCancellation") ? { emailOnCancellation: (String(formData.get("emailOnCancellation") || "STAFF_AND_APPROVER")) as import("@prisma/client").EmailRecipients } : {}),
  });
  revalidatePath("/admin/config");
}
