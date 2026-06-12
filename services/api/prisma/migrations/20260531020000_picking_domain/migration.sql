-- CreateEnum
CREATE TYPE "PickTaskStatus" AS ENUM ('queued', 'assigned', 'picking', 'packed', 'ready_for_pickup');

-- CreateEnum
CREATE TYPE "PickItemStatus" AS ENUM ('pending', 'picked', 'refused', 'substituted');

-- CreateEnum
CREATE TYPE "SubstitutionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'ready_for_pickup';

-- CreateTable
CREATE TABLE "pick_tasks" (
    "id" TEXT NOT NULL,
    "orderGroupId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "pickerId" TEXT,
    "status" "PickTaskStatus" NOT NULL DEFAULT 'queued',
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pick_items" (
    "id" TEXT NOT NULL,
    "pickTaskId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "status" "PickItemStatus" NOT NULL DEFAULT 'pending',
    "quantityPicked" INTEGER,
    "weightGramsPicked" INTEGER,
    "refusalReason" TEXT,
    "boxId" TEXT,
    "pickedById" TEXT,
    "pickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitutions" (
    "id" TEXT NOT NULL,
    "pickItemId" TEXT NOT NULL,
    "substituteOfferId" TEXT,
    "substituteProductId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "priceDiffCents" INTEGER NOT NULL,
    "approvalStatus" "SubstitutionStatus" NOT NULL DEFAULT 'pending',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "substitutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boxes" (
    "id" TEXT NOT NULL,
    "pickTaskId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "passcode" TEXT NOT NULL,
    "sealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boxes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pick_tasks_orderGroupId_key" ON "pick_tasks"("orderGroupId");

-- CreateIndex
CREATE INDEX "pick_tasks_storeId_status_idx" ON "pick_tasks"("storeId", "status");

-- CreateIndex
CREATE INDEX "pick_tasks_pickerId_idx" ON "pick_tasks"("pickerId");

-- CreateIndex
CREATE UNIQUE INDEX "pick_items_orderItemId_key" ON "pick_items"("orderItemId");

-- CreateIndex
CREATE INDEX "pick_items_pickTaskId_idx" ON "pick_items"("pickTaskId");

-- CreateIndex
CREATE INDEX "pick_items_boxId_idx" ON "pick_items"("boxId");

-- CreateIndex
CREATE UNIQUE INDEX "substitutions_pickItemId_key" ON "substitutions"("pickItemId");

-- CreateIndex
CREATE UNIQUE INDEX "boxes_serial_key" ON "boxes"("serial");

-- CreateIndex
CREATE INDEX "boxes_pickTaskId_idx" ON "boxes"("pickTaskId");

-- AddForeignKey
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_orderGroupId_fkey" FOREIGN KEY ("orderGroupId") REFERENCES "order_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_pickerId_fkey" FOREIGN KEY ("pickerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_items" ADD CONSTRAINT "pick_items_pickTaskId_fkey" FOREIGN KEY ("pickTaskId") REFERENCES "pick_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_items" ADD CONSTRAINT "pick_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_items" ADD CONSTRAINT "pick_items_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "boxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_pickItemId_fkey" FOREIGN KEY ("pickItemId") REFERENCES "pick_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_pickTaskId_fkey" FOREIGN KEY ("pickTaskId") REFERENCES "pick_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

