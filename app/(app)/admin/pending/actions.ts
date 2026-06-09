"use server";

import { revalidatePath } from "next/cache";
import { cancelLeaveRequest, type CancelResult } from "@/lib/cancellation";
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
