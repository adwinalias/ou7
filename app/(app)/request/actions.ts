"use server";

import {
  getRequestContext,
  previewLeave,
  submitLeave,
  type LeaveInput,
  type PreviewResult,
  type RequestContext,
  type SubmitResult,
} from "@/lib/leave";
import { requireActor } from "@/lib/rbac";

// Lazily load the request context for the side-peek (Epic 18.7) so the persistent
// header trigger doesn't add a query to every page — it's fetched only when the peek
// opens. Authorizes server-side via requireActor() (any active, provisioned employee
// may read their OWN request context), same as the preview/submit actions.
export async function requestContextAction(): Promise<RequestContext> {
  const actor = await requireActor();
  return getRequestContext(actor.employeeId);
}

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
