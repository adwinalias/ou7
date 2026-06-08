"use server";

import { previewLeave, submitLeave, type LeaveInput, type PreviewResult, type SubmitResult } from "@/lib/leave";
import { requireActor } from "@/lib/rbac";

// Server actions for the request flow. Both authorize server-side via requireActor():
// any active, provisioned employee may preview/book their OWN leave.
export async function previewAction(input: LeaveInput): Promise<PreviewResult> {
  const actor = await requireActor();
  return previewLeave(actor.employeeId, input);
}

export async function submitAction(input: LeaveInput): Promise<SubmitResult> {
  const actor = await requireActor();
  return submitLeave(actor.employeeId, input);
}
