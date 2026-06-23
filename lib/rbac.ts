import "server-only"; // Epic 22.4: the RBAC guard resolves identity from the session + DB — server-only.
// Central RBAC guard (Epic 1.4). The ONE place that turns a session into an authorized
// Actor. Authority (role / level / approver assignments / status) is resolved FRESH from
// the DB here on every call, so HR role changes apply immediately and every action is
// authorized server-side. Policy decisions are delegated to the pure core/authz module.
//
// Two call shapes:
//   • Pages / server components → requireUser() / requireRole() (redirect on failure).
//   • Route handlers / server actions → withAuth() / requireActor() / assert() (throw → 403).
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasRole } from "@/core/authz";
import type { Actor, Role } from "@/core/types";
import { authOptions } from "./auth";
import { db } from "./db";

export type AuthResult =
  | { ok: true; actor: Actor }
  | { ok: false; reason: "unauthenticated" | "unprovisioned" | "inactive" };

/**
 * Build an Actor from the DB. Prefer the stable id on the token; fall back to email so a
 * user provisioned AFTER their first sign-in works without signing out and back in
 * (the token's employeeId is still null until re-login). See ADR 0004.
 */
async function resolveActor(employeeId: string | null, email: string | null): Promise<Actor | null> {
  const normalizedEmail = email?.toLowerCase() ?? null;
  const select = {
    id: true,
    role: true,
    approverLevel: true,
    status: true,
    approverFor: { select: { employeeId: true } },
  } as const;

  let emp = employeeId ? await db.employee.findUnique({ where: { id: employeeId }, select }) : null;
  if (!emp && normalizedEmail) {
    emp = await db.employee.findUnique({ where: { email: normalizedEmail }, select });
  }
  if (!emp) return null;

  return {
    employeeId: emp.id,
    role: emp.role,
    approverLevel: emp.approverLevel,
    status: emp.status,
    approverForIds: emp.approverFor.map((a) => a.employeeId),
  };
}

/** Resolve the current request's authorization state. Does not redirect or throw. */
export async function getAuthState(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, reason: "unauthenticated" };

  const actor = await resolveActor(session.user.employeeId ?? null, session.user.email ?? null);
  if (!actor) return { ok: false, reason: "unprovisioned" };
  if (actor.status !== "ACTIVE") return { ok: false, reason: "inactive" };
  return { ok: true, actor };
}

// ─── Page / server-component guards (redirect on failure) ────────────────────────
export async function requireUser(): Promise<Actor> {
  const state = await getAuthState();
  if (state.ok) return state.actor;
  if (state.reason === "unauthenticated") redirect("/sign-in");
  redirect("/not-provisioned");
}

export async function requireRole(role: Role): Promise<Actor> {
  const actor = await requireUser();
  if (!hasRole(actor, role)) redirect("/dashboard");
  return actor;
}

// ─── Route-handler / server-action guards (throw → mapped to 401/403) ────────────
export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Resolve the Actor or throw AuthError (401 unauthenticated, 403 blocked). */
export async function requireActor(): Promise<Actor> {
  const state = await getAuthState();
  if (state.ok) return state.actor;
  if (state.reason === "unauthenticated") throw new AuthError(401, "Not signed in.");
  throw new AuthError(403, "Your account isn't active. Contact HR.");
}

/** Authorize a capability inside a server action; throws 403 when the check fails. */
export function assert(condition: boolean, message = "Forbidden."): asserts condition {
  if (!condition) throw new AuthError(403, message);
}

type RouteHandler = (req: Request, ctx: { actor: Actor }) => Promise<Response> | Response;

/**
 * Wrap a route handler so it only runs for an authorized Actor; AuthError becomes a
 * 401/403 JSON response. Optionally require a specific role.
 */
export function withAuth(handler: RouteHandler, opts: { role?: Role } = {}) {
  return async (req: Request): Promise<Response> => {
    try {
      const actor = await requireActor();
      if (opts.role && !hasRole(actor, opts.role)) {
        throw new AuthError(403, "Insufficient permissions.");
      }
      return await handler(req, { actor });
    } catch (err) {
      if (err instanceof AuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  };
}
