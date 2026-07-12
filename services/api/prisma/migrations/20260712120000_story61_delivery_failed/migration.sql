-- CreateEnum
CREATE TYPE "DeliveryFailReason" AS ENUM ('customer_absent', 'wrong_address', 'refused', 'other');

-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE 'failed';

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "failReason" "DeliveryFailReason",
ADD COLUMN     "failNote" TEXT,
ADD COLUMN     "failedAt" TIMESTAMP(3);
