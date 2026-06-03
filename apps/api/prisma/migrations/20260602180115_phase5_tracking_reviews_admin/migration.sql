-- CreateEnum
CREATE TYPE "ReviewAxis" AS ENUM ('platform', 'delivery', 'merchant');

-- CreateEnum
CREATE TYPE "TipStatus" AS ENUM ('pending', 'paid', 'failed');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ios', 'android', 'web');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliverySlotId" TEXT;

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "axis" "ReviewAxis" NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "targetMerchantId" TEXT,
    "targetDriverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tips" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "TipStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL,
    "providerChargeId" TEXT,
    "pixQrCode" TEXT,
    "pixQrCodeUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_slots" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_quality_snapshots" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalProducts" INTEGER NOT NULL,
    "avgScore" INTEGER NOT NULL,
    "distribution" JSONB NOT NULL,
    "byStatus" JSONB NOT NULL,

    CONSTRAINT "catalog_quality_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_targetMerchantId_idx" ON "reviews"("targetMerchantId");

-- CreateIndex
CREATE INDEX "reviews_targetDriverId_idx" ON "reviews"("targetDriverId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_orderId_axis_key" ON "reviews"("orderId", "axis");

-- CreateIndex
CREATE UNIQUE INDEX "tips_orderId_key" ON "tips"("orderId");

-- CreateIndex
CREATE INDEX "tips_driverId_status_idx" ON "tips"("driverId", "status");

-- CreateIndex
CREATE INDEX "tips_providerChargeId_idx" ON "tips"("providerChargeId");

-- CreateIndex
CREATE INDEX "delivery_slots_storeId_start_idx" ON "delivery_slots"("storeId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_slots_storeId_start_end_key" ON "delivery_slots"("storeId", "start", "end");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");

-- CreateIndex
CREATE INDEX "catalog_quality_snapshots_capturedAt_idx" ON "catalog_quality_snapshots"("capturedAt");

-- CreateIndex
CREATE INDEX "orders_deliverySlotId_idx" ON "orders"("deliverySlotId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliverySlotId_fkey" FOREIGN KEY ("deliverySlotId") REFERENCES "delivery_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_slots" ADD CONSTRAINT "delivery_slots_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
