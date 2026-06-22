-- AlterTable
ALTER TABLE "users" ADD COLUMN     "activeVehicleId" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_activeVehicleId_fkey" FOREIGN KEY ("activeVehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
