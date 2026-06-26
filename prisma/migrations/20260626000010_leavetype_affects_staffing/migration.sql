-- Story 28.3: per-type "affects staffing levels" flag.
-- Default true so all existing leave types keep counting toward coverage checks.
ALTER TABLE "LeaveType" ADD COLUMN "affectsStaffingLevels" BOOLEAN NOT NULL DEFAULT true;
