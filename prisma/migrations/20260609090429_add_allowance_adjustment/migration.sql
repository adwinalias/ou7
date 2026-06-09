-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('ADJUSTMENT', 'DEDUCTION');

-- CreateTable
CREATE TABLE "AllowanceAdjustment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AllowanceAdjustment_periodId_idx" ON "AllowanceAdjustment"("periodId");

-- AddForeignKey
ALTER TABLE "AllowanceAdjustment" ADD CONSTRAINT "AllowanceAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowanceAdjustment" ADD CONSTRAINT "AllowanceAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AllowancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowanceAdjustment" ADD CONSTRAINT "AllowanceAdjustment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
