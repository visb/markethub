-- S4.4: oferta direcionada de rota a um entregador.

-- AlterTable
ALTER TABLE "delivery_routes" ADD COLUMN "offeredToDriverId" TEXT;

-- CreateIndex
CREATE INDEX "delivery_routes_offeredToDriverId_status_idx" ON "delivery_routes"("offeredToDriverId", "status");
