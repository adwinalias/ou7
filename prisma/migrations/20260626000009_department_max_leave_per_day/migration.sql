-- Story 28.2 (ADR-0014): add maxLeavePerDay to Department.
-- Additive, nullable — existing rows default to NULL (no limit).
ALTER TABLE "Department" ADD COLUMN "maxLeavePerDay" INTEGER;
