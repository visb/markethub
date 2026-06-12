-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('unit', 'weight');

-- AlterTable: novo rótulo de embalagem + tipo de venda
ALTER TABLE "products" ADD COLUMN "packageSize" TEXT;
ALTER TABLE "products" ADD COLUMN "saleType" "SaleType" NOT NULL DEFAULT 'unit';

-- Preserva o valor antigo de "unit" como rótulo de embalagem
UPDATE "products" SET "packageSize" = "unit";

-- Remove a coluna antiga
ALTER TABLE "products" DROP COLUMN "unit";
