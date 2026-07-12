-- Story 57: pausa temporária de emergência da loja.
-- `pausedAt` null = operando; timestamp = "pausada desde HH:MM". Independente de
-- `active` (ativação administrativa) e do horário semanal. Bloqueia todo pedido novo.
-- AlterTable
ALTER TABLE "stores" ADD COLUMN "pausedAt" TIMESTAMP(3);
