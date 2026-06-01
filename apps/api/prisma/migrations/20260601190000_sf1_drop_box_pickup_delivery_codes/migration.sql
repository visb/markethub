-- SF.1: remove caixa física (Box) e adiciona códigos de coleta/entrega.

-- DropForeignKey
ALTER TABLE "pick_items" DROP CONSTRAINT "pick_items_boxId_fkey";

-- DropForeignKey
ALTER TABLE "boxes" DROP CONSTRAINT "boxes_pickTaskId_fkey";

-- DropIndex
DROP INDEX "pick_items_boxId_idx";

-- AlterTable
ALTER TABLE "pick_items" DROP COLUMN "boxId";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "deliveryCode" TEXT;

-- AlterTable
ALTER TABLE "order_groups" ADD COLUMN "pickupCode" TEXT;

-- DropTable
DROP TABLE "boxes";
