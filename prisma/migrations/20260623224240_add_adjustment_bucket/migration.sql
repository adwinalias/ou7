-- CreateEnum
CREATE TYPE "AllowanceBucket" AS ENUM ('VACATION', 'PUBLIC_HOLIDAY');

-- AlterTable
ALTER TABLE "AllowanceAdjustment" ADD COLUMN     "bucket" "AllowanceBucket" NOT NULL DEFAULT 'VACATION';
