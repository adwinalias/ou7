-- AlterTable: Story 26.5 — allow-consecutive-bookings toggle per leave type.
-- Boolean NOT NULL with DEFAULT true: existing types keep allowing consecutive. Additive; safe.
ALTER TABLE "LeaveType" ADD COLUMN "allowConsecutive" BOOLEAN NOT NULL DEFAULT true;
