-- AlterTable
ALTER TABLE "products" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'erp';
