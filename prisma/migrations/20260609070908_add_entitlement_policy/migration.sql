-- CreateTable
CREATE TABLE "EntitlementPolicy" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "annualDays" DOUBLE PRECISION NOT NULL,
    "carryOverCapDays" DOUBLE PRECISION,
    "carryOverExpiry" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntitlementPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntitlementPolicy_regionId_role_key" ON "EntitlementPolicy"("regionId", "role");

-- AddForeignKey
ALTER TABLE "EntitlementPolicy" ADD CONSTRAINT "EntitlementPolicy_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
