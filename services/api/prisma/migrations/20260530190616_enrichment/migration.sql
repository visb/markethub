-- AlterTable
ALTER TABLE "products" ADD COLUMN     "lockedFields" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "cosmos_cache" (
    "gtin" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL,
    "payload" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cosmos_cache_pkey" PRIMARY KEY ("gtin")
);

-- CreateTable
CREATE TABLE "category_mappings" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "categoryId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mapper" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_enrichments" (
    "productId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "raw" JSONB,
    "provenance" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_enrichments_pkey" PRIMARY KEY ("productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_mappings_source_sourceKey_key" ON "category_mappings"("source", "sourceKey");

-- AddForeignKey
ALTER TABLE "category_mappings" ADD CONSTRAINT "category_mappings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_enrichments" ADD CONSTRAINT "product_enrichments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
