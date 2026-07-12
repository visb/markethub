-- Story 58: config de entrega por loja (taxa, pedido mínimo e raio).
-- `null` = herda a tarifa da rede / sem pedido mínimo / sem raio além da cidade.
ALTER TABLE "stores" ADD COLUMN "deliveryFeeCents" INTEGER;
ALTER TABLE "stores" ADD COLUMN "minOrderCents" INTEGER;
ALTER TABLE "stores" ADD COLUMN "deliveryRadiusKm" DOUBLE PRECISION;
