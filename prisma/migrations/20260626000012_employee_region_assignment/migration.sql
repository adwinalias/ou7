-- CreateTable: effective-dated region assignment history (ADR-0015, story 30.2).
-- Employee.regionId is kept as a denormalised "current region" cache; this table records
-- the full history so "region on date D" is well-defined. ON DELETE RESTRICT matches the
-- pattern used by other Employee FK references (e.g. StaffRestriction, AllowancePeriod).
CREATE TABLE "EmployeeRegionAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeRegionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeRegionAssignment_employeeId_effectiveFrom_idx" ON "EmployeeRegionAssignment"("employeeId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "EmployeeRegionAssignment" ADD CONSTRAINT "EmployeeRegionAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRegionAssignment" ADD CONSTRAINT "EmployeeRegionAssignment_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: seed one assignment row per employee at their joining date so every employee
-- has a known region-history baseline from day 1. gen_random_uuid() is built-in in
-- Postgres 13+; the id column is TEXT so the cast to text is required.
INSERT INTO "EmployeeRegionAssignment" ("id", "employeeId", "regionId", "effectiveFrom", "createdAt")
SELECT gen_random_uuid()::text, id, "regionId", "joiningDate", now()
FROM "Employee";
