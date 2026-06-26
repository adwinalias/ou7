// Story 27.4 — Archive staff Tags (archive-not-delete).
// Guards: membership intact after archive, tag excluded from active listing / wall-chart
// tags projection, restore reinstates it, audit entries written.
// Self-skips without a DB (matches the project-wide integration test pattern).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTag, listTags, setTagArchived } from "@/lib/config";
import { db } from "@/lib/db";

let dbUp = false;
try {
  await db.$queryRaw`SELECT 1`;
  dbUp = true;
} catch {
  dbUp = false;
}
const suite = dbUp ? describe : describe.skip;
if (!dbUp) console.warn("[tag-archive.integration] DATABASE_URL unreachable — skipping.");

const PREFIX = "tag-arc-it-";

let regionId = "";
let actorId = "";
let employeeId = "";
let tagId = "";

suite("Tag archive invariants (story 27.4)", () => {
  beforeAll(async () => {
    const region = await db.region.upsert({
      where: { name: `${PREFIX}region` },
      update: {},
      create: { name: `${PREFIX}region`, weekendDays: [6, 0] },
    });
    regionId = region.id;

    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.tag.deleteMany({ where: { name: { startsWith: PREFIX } } });

    actorId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}hr@interestingtimes.me`,
          firstName: "TagArc",
          lastName: "HR",
          regionId,
          joiningDate: new Date("2024-01-01T00:00:00.000Z"),
          role: "HR",
        },
      })
    ).id;

    employeeId = (
      await db.employee.create({
        data: {
          email: `${PREFIX}staff@interestingtimes.me`,
          firstName: "TagArc",
          lastName: "Staff",
          regionId,
          joiningDate: new Date("2024-01-01T00:00:00.000Z"),
          role: "STAFF",
        },
      })
    ).id;

    tagId = await createTag(actorId, `${PREFIX}squad`);

    // Assign the employee to the tag (m2m).
    await db.tag.update({
      where: { id: tagId },
      data: { employees: { connect: { id: employeeId } } },
    });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.employee.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.tag.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await db.region.deleteMany({ where: { name: `${PREFIX}region` } });
    await db.$disconnect();
  });

  it("active tag appears in listTags()", async () => {
    const tags = await listTags();
    expect(tags.some((t) => t.id === tagId && !t.archived)).toBe(true);
  });

  it("archiving a tag preserves the m2m membership (employee still linked)", async () => {
    await setTagArchived(actorId, tagId, true);

    // m2m row must still exist — fetch the tag with employees relation.
    const tag = await db.tag.findUniqueOrThrow({ where: { id: tagId }, include: { employees: { select: { id: true } } } });
    expect(tag.archived).toBe(true);
    expect(tag.employees.some((e) => e.id === employeeId)).toBe(true);
  });

  it("archived tag is excluded from the active-tag listing used by pickers", async () => {
    // ponytail: active-tag query mirrors what wallchart uses — archived: false filter.
    const activeTags = await db.tag.findMany({ where: { archived: false }, select: { id: true } });
    expect(activeTags.some((t) => t.id === tagId)).toBe(false);
  });

  it("archived tag is excluded from the employee tags projection (wall-chart grouping)", async () => {
    // Mirror the wallchart query: select tags where archived: false.
    const emp = await db.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { tags: { where: { archived: false }, select: { name: true } } },
    });
    expect(emp.tags.some((t) => t.name.startsWith(PREFIX))).toBe(false);
  });

  it("listTags() shows archived flag correctly", async () => {
    const tags = await listTags();
    const tag = tags.find((t) => t.id === tagId);
    expect(tag?.archived).toBe(true);
  });

  it("audit log records the TAG_ARCHIVE action", async () => {
    const evt = await db.auditEvent.findFirst({ where: { action: "TAG_ARCHIVE", entityId: tagId } });
    expect(evt).toBeTruthy();
    expect(evt?.before).toMatchObject({ archived: false });
    expect(evt?.after).toMatchObject({ archived: true });
  });

  it("restoring a tag makes it active again and its name re-appears in the active listing", async () => {
    await setTagArchived(actorId, tagId, false);

    const activeTags = await db.tag.findMany({ where: { archived: false }, select: { id: true } });
    expect(activeTags.some((t) => t.id === tagId)).toBe(true);

    // Employee projection also shows the tag again.
    const emp = await db.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { tags: { where: { archived: false }, select: { name: true } } },
    });
    expect(emp.tags.some((t) => t.name.startsWith(PREFIX))).toBe(true);
  });

  it("audit log records the TAG_RESTORE action", async () => {
    const evt = await db.auditEvent.findFirst({ where: { action: "TAG_RESTORE", entityId: tagId } });
    expect(evt).toBeTruthy();
    expect(evt?.before).toMatchObject({ archived: true });
    expect(evt?.after).toMatchObject({ archived: false });
  });
});
