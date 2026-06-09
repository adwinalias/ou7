"use server";

import { revalidatePath } from "next/cache";
import { sendReminder, type ReminderResult } from "@/lib/reminders";
import { AuthError, requireActor } from "@/lib/rbac";

// HR send-reminder from the company pending queue (Epic 5.7). sendReminder authorizes
// owner-vs-HR internally and audits.
export async function remindAction(input: { requestId: string }): Promise<ReminderResult> {
  const actor = await requireActor();
  try {
    const res = await sendReminder(actor, input.requestId);
    if (res.ok) revalidatePath("/admin/pending");
    return res;
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.message };
    throw err;
  }
}
