/*
  Warnings:

  - You are about to drop the column `pickupStopId` on the `order_groups` table. All the data in the column will be lost.
  - You are about to drop the `delivery_routes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `driver_profiles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `route_stops` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('delivery', 'pickup');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('unassigned', 'assigned', 'picked_up', 'delivered', 'canceled');

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'driver';

-- DropForeignKey
ALTER TABLE "delivery_routes" DROP CONSTRAINT "delivery_routes_driverId_fkey";

-- DropForeignKey
ALTER TABLE "driver_profiles" DROP CONSTRAINT "driver_profiles_userId_fkey";

-- DropForeignKey
ALTER TABLE "order_groups" DROP CONSTRAINT "order_groups_pickupStopId_fkey";

-- DropForeignKey
ALTER TABLE "route_stops" DROP CONSTRAINT "route_stops_orderId_fkey";

-- DropForeignKey
ALTER TABLE "route_stops" DROP CONSTRAINT "route_stops_routeId_fkey";

-- DropForeignKey
ALTER TABLE "route_stops" DROP CONSTRAINT "route_stops_storeId_fkey";

-- DropIndex
DROP INDEX "order_groups_pickupStopId_idx";

-- AlterTable
ALTER TABLE "order_groups" DROP COLUMN "pickupStopId",
ADD COLUMN     "fulfillment" "FulfillmentType" NOT NULL DEFAULT 'delivery';

-- DropTable
DROP TABLE "delivery_routes";

-- DropTable
DROP TABLE "driver_profiles";

-- DropTable
DROP TABLE "route_stops";

-- DropEnum
DROP TYPE "DeliveryRouteStatus";

-- DropEnum
DROP TYPE "DriverStatus";

-- DropEnum
DROP TYPE "RouteStopStatus";

-- DropEnum
DROP TYPE "RouteStopType";

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "orderGroupId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "driverId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'unassigned',
    "assignedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_orderGroupId_key" ON "deliveries"("orderGroupId");

-- CreateIndex
CREATE INDEX "deliveries_storeId_status_idx" ON "deliveries"("storeId", "status");

-- CreateIndex
CREATE INDEX "deliveries_driverId_status_idx" ON "deliveries"("driverId", "status");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_orderGroupId_fkey" FOREIGN KEY ("orderGroupId") REFERENCES "order_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
