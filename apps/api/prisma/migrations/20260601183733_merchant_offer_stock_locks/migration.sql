-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "lockedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedById" TEXT;

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "lockedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedById" TEXT;
