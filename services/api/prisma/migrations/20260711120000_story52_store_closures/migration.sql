-- CreateTable
CREATE TABLE "store_closures" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_closures_storeId_idx" ON "store_closures"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "store_closures_storeId_date_key" ON "store_closures"("storeId", "date");

-- AddForeignKey
ALTER TABLE "store_closures" ADD CONSTRAINT "store_closures_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
