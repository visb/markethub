-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "allowsPickup" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "store_hours" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" INTEGER NOT NULL,
    "closesAt" INTEGER NOT NULL,

    CONSTRAINT "store_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_hours_storeId_idx" ON "store_hours"("storeId");

-- AddForeignKey
ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
