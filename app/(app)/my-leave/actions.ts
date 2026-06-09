"use server";

import { revalidatePath } from "next/cache";
import { cancelLeaveRequest } from "@/lib/cancellation";
import { sendReminder } from "@/lib/reminders";
import { requireActor } from "@/lib/rbac";

// Owner self-cancel / send-reminder from My Leave. Thin wrappers — the libs authorize
// (owner vs HR → 403), enforce the cancellation rule, and audit. No logic duplicated here.
// The page only renders these actions where they're allowed (see canCancel/canRemind), so
// a plain server-action form is enough.

export async function cancelOwnAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await cancelLeaveRequest(actor, String(formData.get("requestId")));
  revalidatePath("/my-leave");
}

export async function remindOwnAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await sendReminder(actor, String(formData.get("requestId")));
  revalidatePath("/my-leave");
}
