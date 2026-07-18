-- CreateEnum
CREATE TYPE "TipTarget" AS ENUM ('platform', 'driver', 'merchant');

-- AlterTable: driverId do Tip vira nullable (o alvo entregador migrou para TipItem)
ALTER TABLE "tips" ALTER COLUMN "driverId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "tip_items" (
    "id" TEXT NOT NULL,
    "tipId" TEXT NOT NULL,
    "target" "TipTarget" NOT NULL,
    "targetDriverId" TEXT,
    "targetMerchantId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tip_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tip_items_tipId_idx" ON "tip_items"("tipId");

-- CreateIndex
CREATE INDEX "tip_items_target_targetDriverId_idx" ON "tip_items"("target", "targetDriverId");

-- AddForeignKey
ALTER TABLE "tip_items" ADD CONSTRAINT "tip_items_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "tips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada gorjeta legada (driver) vira um TipItem driver de mesmo valor,
-- para o histórico/ganhos do entregador não quebrarem.
INSERT INTO "tip_items" ("id", "tipId", "target", "targetDriverId", "amountCents", "createdAt")
SELECT gen_random_uuid()::text, "id", 'driver'::"TipTarget", "driverId", "amountCents", "createdAt"
FROM "tips"
WHERE "driverId" IS NOT NULL;
