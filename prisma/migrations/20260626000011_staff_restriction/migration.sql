-- CreateTable
CREATE TABLE "StaffRestriction" (
    "id" TEXT NOT NULL,
    "employeeAId" TEXT NOT NULL,
    "employeeBId" TEXT NOT NULL,
    "bidirectional" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffRestriction_employeeAId_employeeBId_key" ON "StaffRestriction"("employeeAId", "employeeBId");

-- CreateIndex
CREATE INDEX "StaffRestriction_employeeAId_idx" ON "StaffRestriction"("employeeAId");

-- CreateIndex
CREATE INDEX "StaffRestriction_employeeBId_idx" ON "StaffRestriction"("employeeBId");

-- AddForeignKey
ALTER TABLE "StaffRestriction" ADD CONSTRAINT "StaffRestriction_employeeAId_fkey" FOREIGN KEY ("employeeAId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRestriction" ADD CONSTRAINT "StaffRestriction_employeeBId_fkey" FOREIGN KEY ("employeeBId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
