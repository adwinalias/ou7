"use server";

import { revalidatePath } from "next/cache";
import { isHR } from "@/core/authz";
import { cloneHolidays, createHoliday, deleteHoliday, updateRegionWeekends } from "@/lib/calendars";
import { AuthError, requireActor } from "@/lib/rbac";

async function hr() {
  const actor = await requireActor();
  if (!isHR(actor)) throw new AuthError(403, "HR only.");
  return actor;
}

export async function updateWeekendsAction(formData: FormData) {
  const actor = await hr();
  const regionId = String(formData.get("regionId"));
  const weekendDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => formData.get(`wd-${d}`) === "on");
  await updateRegionWeekends(actor.employeeId, regionId, weekendDays);
  revalidatePath("/admin/calendars");
}

export async function createHolidayAction(formData: FormData) {
  const actor = await hr();
  await createHoliday(actor.employeeId, {
    regionId: String(formData.get("regionId")),
    dateISO: String(formData.get("date")),
    name: String(formData.get("name")),
  });
  revalidatePath("/admin/calendars");
}

export async function deleteHolidayAction(formData: FormData) {
  const actor = await hr();
  await deleteHoliday(actor.employeeId, String(formData.get("id")));
  revalidatePath("/admin/calendars");
}

export async function cloneHolidaysAction(formData: FormData) {
  const actor = await hr();
  await cloneHolidays(actor.employeeId, String(formData.get("regionId")), Number(formData.get("fromYear")));
  revalidatePath("/admin/calendars");
}
