-- AlterTable: Story 26.4 — minimum length & max consecutive days per leave type.
-- Nullable (no constraint when null). Additive; safe to apply on existing data.
ALTER TABLE "LeaveType" ADD COLUMN "minLengthDays" INTEGER;
ALTER TABLE "LeaveType" ADD COLUMN "maxConsecutiveDays" INTEGER;
