"use server";

import { revalidatePath } from "next/cache";
import type { ApproverLevel, EmploymentType, Role } from "@prisma/client";
import { isHR } from "@/core/authz";
import {
  bulkImportEmployees,
  createEmployee,
  deactivateEmployee,
  generateAllowanceProfile,
  type ImportSummary,
  updateEmployee,
} from "@/lib/employees";
import { AuthError, requireActor } from "@/lib/rbac";

async function hr() {
  const actor = await requireActor();
  if (!isHR(actor)) throw new AuthError(403, "HR only.");
  return actor;
}

export async function createEmployeeAction(formData: FormData) {
  const actor = await hr();
  await createEmployee(actor.employeeId, {
    email: String(formData.get("email")),
    firstName: String(formData.get("firstName")),
    lastName: String(formData.get("lastName")),
    regionId: String(formData.get("regionId")),
    departmentId: formData.get("departmentId") ? String(formData.get("departmentId")) : null,
    managerId: formData.get("managerId") ? String(formData.get("managerId")) : null,
    joiningISO: String(formData.get("joiningISO")),
    role: String(formData.get("role")) as Role,
    approverLevel: String(formData.get("approverLevel")) as ApproverLevel,
    employmentType: String(formData.get("employmentType")) as EmploymentType,
  });
  revalidatePath("/admin/employees");
}

export type UpdateEmployeeState = { ok: boolean; message: string } | null;

/** Edit an employee's record (Epic 19.3b / AD7). HR-only, audited via updateEmployee.
 *  Sensitive-field confirmation is enforced in the client; authz is re-checked here. */
export async function updateEmployeeAction(_prev: UpdateEmployeeState, formData: FormData): Promise<UpdateEmployeeState> {
  const actor = await hr();
  const employeeId = String(formData.get("employeeId"));
  const regionEffectiveRaw = formData.get("regionEffectiveFrom");
  await updateEmployee(actor.employeeId, employeeId, {
    firstName: String(formData.get("firstName")),
    lastName: String(formData.get("lastName")),
    regionId: String(formData.get("regionId")),
    regionEffectiveFrom: regionEffectiveRaw ? String(regionEffectiveRaw) : undefined,
    departmentId: formData.get("departmentId") ? String(formData.get("departmentId")) : null,
    approverLevel: String(formData.get("approverLevel")) as ApproverLevel,
    employmentType: String(formData.get("employmentType")) as EmploymentType,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/employees");
  return { ok: true, message: "Changes saved." };
}

export type ProfileState = { ok: boolean; message: string } | null;

export async function generateProfileAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const actor = await hr();
  const res = await generateAllowanceProfile(actor.employeeId, String(formData.get("employeeId")), Number(formData.get("year")));
  revalidatePath("/admin/employees");
  return res.ok
    ? { ok: true, message: `Profile created — opening ${res.opening} day(s).` }
    : { ok: false, message: res.error };
}

export async function deactivateAction(formData: FormData) {
  const actor = await hr();
  await deactivateEmployee(actor.employeeId, String(formData.get("employeeId")));
  revalidatePath("/admin/employees");
}

export async function importAction(_prev: ImportSummary | null, formData: FormData): Promise<ImportSummary> {
  const actor = await hr();
  const summary = await bulkImportEmployees(actor.employeeId, String(formData.get("csv") ?? ""));
  revalidatePath("/admin/employees");
  return summary;
}
