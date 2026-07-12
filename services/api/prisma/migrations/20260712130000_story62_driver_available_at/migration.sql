-- Story 62: turno on/off do entregador (disponibilidade).
-- `driverAvailableAt` null = indisponível (de folga); timestamp = "disponível desde HH:MM".
-- Global ao driver (não por loja) — o turno é da pessoa. Logout desliga o turno.
-- AlterTable
ALTER TABLE "users" ADD COLUMN "driverAvailableAt" TIMESTAMP(3);
