-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('manager', 'picker');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "marketplaceCategoryId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "store_staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "staffRole" "StaffRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_staff_storeId_idx" ON "store_staff"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "store_staff_userId_storeId_staffRole_key" ON "store_staff"("userId", "storeId", "staffRole");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_categories_slug_key" ON "marketplace_categories"("slug");

-- CreateIndex
CREATE INDEX "marketplace_categories_parentId_idx" ON "marketplace_categories"("parentId");

-- CreateIndex
CREATE INDEX "marketplace_categories_visible_displayOrder_idx" ON "marketplace_categories"("visible", "displayOrder");

-- CreateIndex
CREATE INDEX "categories_marketplaceCategoryId_idx" ON "categories"("marketplaceCategoryId");

-- AddForeignKey
ALTER TABLE "store_staff" ADD CONSTRAINT "store_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_staff" ADD CONSTRAINT "store_staff_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_marketplaceCategoryId_fkey" FOREIGN KEY ("marketplaceCategoryId") REFERENCES "marketplace_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_categories" ADD CONSTRAINT "marketplace_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "marketplace_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
