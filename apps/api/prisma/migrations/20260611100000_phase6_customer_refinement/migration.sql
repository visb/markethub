-- Fase 6 — refinamento do app cliente.

-- S6.7: tempo médio de preparo por loja (compõe o ETA real)
ALTER TABLE "stores" ADD COLUMN "avgPrepMinutes" INTEGER NOT NULL DEFAULT 15;

-- S6.6: pergunta de preparo por categoria curada ({ label, options[] })
ALTER TABLE "marketplace_categories" ADD COLUMN "prepOptions" JSONB;

-- S6.5: favoritos de oferta
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "favorites_userId_offerId_key" ON "favorites"("userId", "offerId");
CREATE INDEX "favorites_userId_idx" ON "favorites"("userId");

ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
