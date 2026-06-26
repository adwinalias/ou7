"use server";

import { revalidatePath } from "next/cache";
import { decideLeaveRequest, type DecideResult } from "@/lib/approvals";
import { AuthError, requireActor } from "@/lib/rbac";

// Approve/decline a request. Authorized server-side: requireActor + per-record check in
// decideLeaveRequest (assigned approver or HR only). Unauthorized → 403 surfaced as an error.
// Story 29.2: overrideReason is HR-only; non-HR actors cannot override a clash.
export async function decideAction(input: {
  requestId: string;
  action: "APPROVE" | "DECLINE";
  comment?: string;
  overrideReason?: string;
}): Promise<DecideResult> {
  const actor = await requireActor();
  try {
    const result = await decideLeaveRequest(actor, input.requestId, input.action, input.comment, input.overrideReason);
    if (result.ok) revalidatePath("/approvals");
    return result;
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, errors: [err.message] };
    throw err;
  }
}
