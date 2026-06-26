// Story 26.3 — Per-type cancellation window: integration tests.
// A leave type with cancellationWindowDays:3 blocks owner self-cancel when start is < 3 days
// away; allows it when start is far enough out. HR can always cancel. Default 0 preserves
// the existing "before the start day" rule. Self-skips when DB is unreachable.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cancelLeaveRequest } from "@/lib/cancellation";
import type { Actor } from "@/core/types";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[cancellation-window.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "cw263-it-";
const CODE_WIN3  = "CW3X";   // cancellationWindowDays: 3
const CODE_ZERO  = "CW0X";   // cancellationWindowDays: 0 (default)

let ownerId = "";
let hrId = "";
let win3TypeId = "";
let zeroTypeId = "";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Asia/Dubai today + N calendar days.
function dateOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

const actor = (over: Partial<Actor> & Pick<Actor, "employeeId" | "role">): Actor =>
  ({ approverLevel: "NONE", status: "ACTIVE", approverForIds: [], ...over });
const owner = () => actor({ employeeId: ownerId, role: "STAFF" });
const hr = () => actor({ employeeId: hrId, role: "HR" });

async function mkPending(leaveTypeId: string, startISO: string) {
  return db.leaveRequest.create({
    data: {
      employeeId: ownerId,
      leaveTypeId,
      startDate: day(startISO),
      endDate: day(startISO),
      durationMode: "DAY",
      workingDays: 1,
      allowanceDays: 0,
      status: "PENDING",
      createdById: ownerId,
    },
  });
}

suite("Story 26.3 — cancellationWindowDays enforcement (integration)", () => {
  beforeAll(async () => {
    const uae = await db.region.upsert({
      where: { name: "UAE" },
      update: {},
      create: { name: "UAE", weekendDays: [6, 0] },
    });

    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_WIN3, CODE_ZERO] } } });

    win3TypeId = (
      await db.leaveType.create({
        data: { name: "CW263 3-day window", code: CODE_WIN3, color: "#2F6FEB", deductsAllowance: false, cancellationWindowDays: 3 },
      })
    ).id;

    zeroTypeId = (
      await db.leaveType.create({
        data: { name: "CW263 Zero window", code: CODE_ZERO, color: "#7C3AED", deductsAllowance: false, cancellationWindowDays: 0 },
      })
    ).id;

    ownerId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}owner@interestingtimes.me`,
          firstName: "CW",
          lastName: "Owner",
          regionId: uae.id,
          joiningDate: day("2024-01-01"),
          role: "STAFF",
        },
      })
    ).id;

    hrId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}hr@interestingtimes.me`,
          firstName: "CW",
          lastName: "HR",
          regionId: uae.id,
          joiningDate: day("2024-01-01"),
          role: "HR",
        },
      })
    ).id;
  });

  beforeEach(async () => {
    await db.leaveRequest.deleteMany({ where: { employeeId: ownerId } });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId: { in: [ownerId, hrId] } } });
    await db.leaveRequest.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.allowancePeriod.deleteMany({ where: { employee: { email: { startsWith: PREFIX } } } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.leaveType.deleteMany({ where: { code: { in: [CODE_WIN3, CODE_ZERO] } } });
    await db.$disconnect();
  });

  // ── cancellationWindowDays: 3 ─────────────────────────────────────────────

  it("window=3: blocks owner self-cancel when start is 2 days away", async () => {
    const startISO = dateOffset(2);
    const req = await mkPending(win3TypeId, startISO);
    const res = await cancelLeaveRequest(owner(), req.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/3 day/i);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
  });

  it("window=3: allows owner self-cancel when start is 10 days away", async () => {
    const startISO = dateOffset(10);
    const req = await mkPending(win3TypeId, startISO);
    const res = await cancelLeaveRequest(owner(), req.id);
    expect(res.ok).toBe(true);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
  });

  it("window=3: HR can still cancel even when within the window", async () => {
    const startISO = dateOffset(2);
    const req = await mkPending(win3TypeId, startISO);
    const res = await cancelLeaveRequest(hr(), req.id);
    expect(res.ok).toBe(true);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
  });

  // ── cancellationWindowDays: 0 (default "before start day" behaviour) ──────

  it("window=0: owner can self-cancel a request starting tomorrow", async () => {
    const startISO = dateOffset(1);
    const req = await mkPending(zeroTypeId, startISO);
    const res = await cancelLeaveRequest(owner(), req.id);
    expect(res.ok).toBe(true);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
  });

  it("window=0: owner is blocked from cancelling a past-start request", async () => {
    const startISO = dateOffset(-5);
    const req = await mkPending(zeroTypeId, startISO);
    const res = await cancelLeaveRequest(owner(), req.id);
    expect(res.ok).toBe(false);
    expect((await db.leaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
  });
});
