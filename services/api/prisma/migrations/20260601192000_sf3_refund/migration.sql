-- SF.3: reembolso único por pedido (falta de peso / item recusado).

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('weight_shortfall', 'refused');

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_components" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "orderGroupId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" "RefundReason" NOT NULL,

    CONSTRAINT "refund_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refunds_orderId_key" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refund_components_refundId_idx" ON "refund_components"("refundId");

-- CreateIndex
CREATE INDEX "refund_components_orderGroupId_idx" ON "refund_components"("orderGroupId");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_components" ADD CONSTRAINT "refund_components_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_components" ADD CONSTRAINT "refund_components_orderGroupId_fkey" FOREIGN KEY ("orderGroupId") REFERENCES "order_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
