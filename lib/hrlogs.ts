// HR logs (Epic 9.4): private OOO/WFH records HR keeps on an employee. They never notify
// anyone and are HR-only. Every write is audited (16.1).
//
// Showing HR logs on the wall chart ("per config") is deferred — see OVERNIGHT-NOTES.md
// (needs a wall-chart change + a visibility flag; the private HR-only record is delivered).
import type { HRLogType } from "@prisma/client";
import { recordAudit } from "./audit";
import { db } from "./db";

const atUtc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toISO = (d: Date) => d.toISOString().slice(0, 10);

export interface HRLogInput {
  employeeId: string;
  type: HRLogType;
  startISO: string;
  endISO: string;
  notes?: string;
}

export async function createHRLog(actorId: string, input: HRLogInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (input.endISO < input.startISO) return { ok: false, error: "End date must be on or after the start date." };
  const log = await db.hRLog.create({
    data: {
      employeeId: input.employeeId,
      type: input.type,
      startDate: atUtc(input.startISO),
      endDate: atUtc(input.endISO),
      notes: input.notes?.trim() || null,
      isPrivate: true,
      createdById: actorId,
    },
  });
  // No notification is sent (private HR record). Audit the write.
  await recordAudit(db, { actorId, action: "HR_LOG_CREATE", entity: "HRLog", entityId: log.id, after: { employeeId: input.employeeId, type: input.type, startISO: input.startISO, endISO: input.endISO } });
  return { ok: true, id: log.id };
}

export async function deleteHRLog(actorId: string, id: string) {
  const before = await db.hRLog.findUnique({ where: { id } });
  if (!before) return;
  await db.hRLog.delete({ where: { id } });
  await recordAudit(db, { actorId, action: "HR_LOG_DELETE", entity: "HRLog", entityId: id, before: { employeeId: before.employeeId, type: before.type } });
}

export async function listHRLogs() {
  const rows = await db.hRLog.findMany({
    orderBy: { startDate: "desc" },
    include: { employee: { select: { firstName: true, lastName: true } } },
  });
  return rows.map((l) => ({
    id: l.id,
    employeeName: `${l.employee.firstName} ${l.employee.lastName}`.trim(),
    type: l.type,
    startISO: toISO(l.startDate),
    endISO: toISO(l.endDate),
    notes: l.notes,
  }));
}
