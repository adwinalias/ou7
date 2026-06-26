-- Story 27.3: per-type email notification matrix.
-- Additive: enum NOT NULL with defaults means existing rows get sensible behavior automatically.
-- Defaults:
--   emailOnRequest      → STAFF_AND_APPROVER (matches current implicit behavior)
--   emailOnDecision     → STAFF             (requester learns the outcome)
--   emailOnCancellation → STAFF_AND_APPROVER (both parties notified)
CREATE TYPE "EmailRecipients" AS ENUM ('NONE', 'STAFF', 'APPROVER', 'STAFF_AND_APPROVER');
ALTER TABLE "LeaveType" ADD COLUMN "emailOnRequest"      "EmailRecipients" NOT NULL DEFAULT 'STAFF_AND_APPROVER';
ALTER TABLE "LeaveType" ADD COLUMN "emailOnDecision"     "EmailRecipients" NOT NULL DEFAULT 'STAFF';
ALTER TABLE "LeaveType" ADD COLUMN "emailOnCancellation" "EmailRecipients" NOT NULL DEFAULT 'STAFF_AND_APPROVER';
