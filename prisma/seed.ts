/**
 * Seed: regions (with market weekends + carry-over rules), the 13 departments,
 * and the leave types. Idempotent — safe to re-run. Entitlement numbers and
 * exact carry-over caps are HR inputs (PRD §14); the values here are placeholders.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// weekendDays: 0=Sun … 6=Sat
const regions = [
  { name: "UAE", weekendDays: [6, 0], carryOverCapDays: 5, carryOverExpiry: "03-31" },
  { name: "KSA", weekendDays: [5, 6], carryOverCapDays: 5, carryOverExpiry: "03-31" },
  { name: "Beirut", weekendDays: [6, 0], carryOverCapDays: 5, carryOverExpiry: "03-31" },
  { name: "Remote", weekendDays: [6, 0], carryOverCapDays: null, carryOverExpiry: null },
];

const departments = [
  "Admin", "CEO", "Creative", "Engagement", "Finance", "HR", "IT",
  "Management", "Media", "Operation", "Planning", "Social Media", "Technology",
];

// color = matching --lt-* design token
const leaveTypes = [
  { name: "Vacation", code: "V", color: "#2F6FEB", deductsAllowance: true,  paid: true,  noteRequired: false, attachmentRequired: false, attachmentThresholdDays: null },
  { name: "Sick Leave Working", code: "SW", color: "#E8833A", deductsAllowance: false, paid: true, noteRequired: true, attachmentRequired: false, attachmentThresholdDays: null },
  { name: "Sick Leave Not Working", code: "SN", color: "#FF3B1F", deductsAllowance: false, paid: true, noteRequired: true, attachmentRequired: true, attachmentThresholdDays: 2 },
  { name: "Bereavement", code: "B", color: "#6B5BD2", deductsAllowance: false, paid: true, noteRequired: false, attachmentRequired: true, attachmentThresholdDays: null },
  { name: "Maternity", code: "M", color: "#14633F", deductsAllowance: false, paid: true, noteRequired: false, attachmentRequired: false, attachmentThresholdDays: null },
  { name: "Paternity", code: "P", color: "#79C36A", deductsAllowance: false, paid: true, noteRequired: false, attachmentRequired: false, attachmentThresholdDays: null },
  { name: "Wedding Leave", code: "W", color: "#D6409F", deductsAllowance: false, paid: true, noteRequired: false, attachmentRequired: false, attachmentThresholdDays: null },
  { name: "National Holiday", code: "H", color: "#5C3D2E", deductsAllowance: false, paid: true, noteRequired: false, attachmentRequired: false, attachmentThresholdDays: null },
  { name: "Out Of Office", code: "O", color: "#B58900", deductsAllowance: false, paid: true, noteRequired: false, attachmentRequired: false, attachmentThresholdDays: null },
];

async function main() {
  for (const r of regions) {
    await db.region.upsert({ where: { name: r.name }, update: r, create: r });
  }
  for (const name of departments) {
    await db.department.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const lt of leaveTypes) {
    await db.leaveType.upsert({ where: { name: lt.name }, update: lt, create: lt });
  }
  console.log(`Seeded ${regions.length} regions, ${departments.length} departments, ${leaveTypes.length} leave types.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
