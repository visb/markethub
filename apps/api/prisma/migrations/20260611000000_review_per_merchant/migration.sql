-- Avaliação por mercado em pedido multi-loja: unicidade passa a incluir o alvo.
-- platform/delivery (targetMerchantId NULL) seguem únicos por service-level check.
DROP INDEX "reviews_orderId_axis_key";

CREATE UNIQUE INDEX "reviews_orderId_axis_targetMerchantId_key" ON "reviews"("orderId", "axis", "targetMerchantId");
