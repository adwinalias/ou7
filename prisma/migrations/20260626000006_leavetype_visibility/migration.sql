-- Story 27.1: per-type visibility — who can see others' leave of this type.
-- Additive: enum NOT NULL with DEFAULT 'EVERYONE' means existing rows stay visible to all.
CREATE TYPE "LeaveTypeVisibility" AS ENUM ('EVERYONE', 'APPROVERS_SUPERUSERS', 'HR_ONLY');
ALTER TABLE "LeaveType" ADD COLUMN "visibility" "LeaveTypeVisibility" NOT NULL DEFAULT 'EVERYONE';
