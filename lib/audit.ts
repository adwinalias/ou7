// Audit log (Epic 16.1). Immutable record of admin + approval writes — who/what/when and
// before→after. Append-only by convention: this module only CREATES AuditEvents; there is
// no update/delete path anywhere. See docs/adr/0006-audit-log.md.
import type { Prisma } from "@prisma/client";
import { db } from "./db";

type Client = Prisma.TransactionClient;

export interface AuditInput {
  actorId: string | null; // the acting employee (null only for system jobs)
  action: string; // e.g. LEAVE_APPROVE, EMPLOYEE_UPDATE, HOLIDAY_CREATE
  entity: string; // e.g. LeaveRequest, Employee, Holiday
  entityId?: string | null;
  before?: unknown; // prior state (omit for creates)
  after?: unknown; // new state (omit for deletes)
}

const asJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined ? undefined : (v as Prisma.InputJsonValue);

/**
 * Write one audit event. Pass a transaction client to make the audit atomic with the
 * write it records (preferred for approvals/admin mutations).
 */
export async function recordAudit(client: Client, e: AuditInput): Promise<void> {
  await client.auditEvent.create({
    data: {
      actorId: e.actorId,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId ?? null,
      before: asJson(e.before),
      after: asJson(e.after),
    },
  });
}

export interface AuditRow {
  id: string;
  createdAt: Date;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
}

export interface AuditPage {
  rows: AuditRow[];
  page: number;
  pageCount: number;
  total: number;
}

const PAGE_SIZE = 50;

/** Read the audit log (newest first), optionally scoped to one entity/record. HR-only at
 *  the call site. */
export async function getAuditEvents(opts: { entity?: string; entityId?: string; page?: number } = {}): Promise<AuditPage> {
  const where = {
    ...(opts.entity ? { entity: opts.entity } : {}),
    ...(opts.entityId ? { entityId: opts.entityId } : {}),
  };
  const total = await db.auditEvent.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), pageCount);

  const events = await db.auditEvent.findMany({
    where,
    include: { actor: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return {
    rows: events.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      actorName: e.actor ? `${e.actor.firstName} ${e.actor.lastName}`.trim() : "System",
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      before: e.before,
      after: e.after,
    })),
    page,
    pageCount,
    total,
  };
}
