// Integration tests for the session→Employee mapping (Epic 2) and the RBAC guard
// (Epic 1.4) against a real Postgres. Skips itself when the DB is unreachable so it
// never breaks a no-DB `npm run test:integration` locally; CI always has Postgres.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Control the session the guard sees. vi.hoisted runs before the imports below so the
// mock factory can safely reference the spy (avoids the const TDZ hoisting trap).
const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { AuthError, getAuthState, withAuth } from "@/lib/rbac";

// Probe DB connectivity once; skip the whole suite if it's down (local no-DB runs).
let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[rbac.integration] DATABASE_URL unreachable — skipping integration suite.");

const PREFIX = "rbac-it-";
const email = (s: string) => `${PREFIX}${s}@interestingtimes.me`;

const ids: Record<string, string> = {};
let regionId = "";

suite("RBAC + session mapping (integration)", () => {
  beforeAll(async () => {
    const region = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });
    regionId = region.id;

    // Clean any leftovers from a prior run.
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });

    const make = (key: string, data: Partial<Parameters<typeof db.employee.create>[0]["data"]>) =>
      db.employee.create({
        data: {
          email: email(key),
          firstName: key,
          lastName: "Test",
          regionId,
          joiningDate: new Date("2024-01-01T00:00:00.000Z"),
          ...data,
        } as Parameters<typeof db.employee.create>[0]["data"],
      });

    ids.staff = (await make("staff", { role: "STAFF" })).id;
    ids.hr = (await make("hr", { role: "HR", approverLevel: "APPROVER_ADD_EDIT" })).id;
    ids.appr = (await make("appr", { role: "APPROVER", approverLevel: "APPROVER" })).id;
    ids.inactive = (await make("inactive", { role: "STAFF", status: "INACTIVE" })).id;
    ids.unlinked = (await make("unlinked", { role: "STAFF" })).id; // googleSub stays null

    // The approver is the assigned approver for staff.
    await db.approverAssignment.create({
      data: { employeeId: ids.staff, approverId: ids.appr },
    });
  });

  afterAll(async () => {
    await db.approverAssignment.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.$disconnect();
  });

  describe("auth jwt callback — mapping + Google linking (Epic 2)", () => {
    const jwt = (args: { token: Record<string, unknown>; profile?: Record<string, unknown> }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (authOptions.callbacks!.jwt as any)(args);

    it("resolves an existing employee and links googleSub on first sign-in", async () => {
      const token = await jwt({ token: {}, profile: { email: email("unlinked"), sub: "google-sub-123" } });
      expect(token.employeeId).toBe(ids.unlinked);
      const reloaded = await db.employee.findUniqueOrThrow({ where: { id: ids.unlinked } });
      expect(reloaded.googleSub).toBe("google-sub-123");
    });

    it("blocks (null employeeId) when an existing googleSub doesn't match", async () => {
      await db.employee.update({ where: { id: ids.staff }, data: { googleSub: "real-sub" } });
      const token = await jwt({ token: {}, profile: { email: email("staff"), sub: "different-sub" } });
      expect(token.employeeId).toBeNull();
    });

    it("returns null employeeId for an unknown email (no self-registration)", async () => {
      const token = await jwt({ token: {}, profile: { email: "stranger@interestingtimes.me", sub: "x" } });
      expect(token.employeeId).toBeNull();
    });
  });

  describe("getAuthState — fresh authority from DB", () => {
    it("unauthenticated when there is no session", async () => {
      getServerSession.mockResolvedValueOnce(null);
      expect(await getAuthState()).toEqual({ ok: false, reason: "unauthenticated" });
    });

    it("resolves an active employee by token employeeId, with approver assignments", async () => {
      getServerSession.mockResolvedValueOnce({ user: { employeeId: ids.appr, email: email("appr") } });
      const state = await getAuthState();
      expect(state.ok).toBe(true);
      if (state.ok) {
        expect(state.actor.role).toBe("APPROVER");
        expect(state.actor.approverForIds).toContain(ids.staff);
      }
    });

    it("falls back to email when the token has no employeeId (provisioned after sign-in)", async () => {
      getServerSession.mockResolvedValueOnce({ user: { employeeId: null, email: email("hr") } });
      const state = await getAuthState();
      expect(state.ok).toBe(true);
      if (state.ok) expect(state.actor.role).toBe("HR");
    });

    it("blocks inactive employees", async () => {
      getServerSession.mockResolvedValueOnce({ user: { employeeId: ids.inactive, email: email("inactive") } });
      expect(await getAuthState()).toEqual({ ok: false, reason: "inactive" });
    });

    it("unprovisioned when neither id nor email match", async () => {
      getServerSession.mockResolvedValueOnce({ user: { employeeId: null, email: "nobody@interestingtimes.me" } });
      expect(await getAuthState()).toEqual({ ok: false, reason: "unprovisioned" });
    });
  });

  describe("withAuth — route-handler authorization", () => {
    const handler = withAuth(async (_req, { actor }) => Response.json({ id: actor.employeeId }), { role: "HR" });

    it("401 when unauthenticated", async () => {
      getServerSession.mockResolvedValueOnce(null);
      const res = await handler(new Request("http://t/"));
      expect(res.status).toBe(401);
    });

    it("403 when the role is insufficient", async () => {
      getServerSession.mockResolvedValueOnce({ user: { employeeId: ids.staff, email: email("staff") } });
      const res = await handler(new Request("http://t/"));
      expect(res.status).toBe(403);
    });

    it("runs the handler for an authorized HR actor", async () => {
      getServerSession.mockResolvedValueOnce({ user: { employeeId: ids.hr, email: email("hr") } });
      const res = await handler(new Request("http://t/"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ id: ids.hr });
    });

    it("AuthError carries the right status codes", () => {
      expect(new AuthError(403, "x").status).toBe(403);
    });
  });
});
