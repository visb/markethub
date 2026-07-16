-- AlterEnum
ALTER TYPE "RefundReason" ADD VALUE 'manual';

-- AlterTable
ALTER TABLE "refund_components" ADD COLUMN     "createdById" TEXT;
