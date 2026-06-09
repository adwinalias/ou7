"use server";

import { revalidatePath } from "next/cache";
import { cancelLeaveRequest, type CancelResult } from "@/lib/cancellation";
import { sendReminder, type ReminderResult } from "@/lib/reminders";
import { AuthError, requireActor } from "@/lib/rbac";

// HR cancel from the company pending queue (Epic 5.6). cancelLeaveRequest authorizes
// owner-vs-HR internally and audits; this just wraps it for the queue UI.
export async function cancelAction(input: { requestId: string }): Promise<CancelResult> {
  const actor = await requireActor();
  try {
    const res = await cancelLeaveRequest(actor, input.requestId);
    if (res.ok) revalidatePath("/admin/pending");
    return res;
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.message };
    throw err;
  }
}

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
