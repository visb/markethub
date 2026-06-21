import type { SaleType } from "@prisma/client";
import type { PrismaService } from "../../src/prisma/prisma.service";

let seq = 0;

export interface SeededOffer {
  merchantId: string;
  storeId: string;
  productId: string;
  offerId: string;
}

/**
 * Cria um merchant + store + product + offer mínimos para cenários de catálogo/
 * carrinho. Cada chamada usa um slug único (não colide entre specs).
 */
export async function seedOffer(
  prisma: PrismaService,
  opts: { priceCents?: number; saleType?: SaleType; available?: boolean; name?: string } = {},
): Promise<SeededOffer> {
  const n = seq++;
  const merchant = await prisma.merchant.create({
    data: { name: `Mercado ${n}`, slug: `mercado-${Date.now()}-${n}`, deliveryFeeCents: 700 },
  });
  const store = await prisma.store.create({
    data: { merchantId: merchant.id, name: `Loja ${n}` },
  });
  const product = await prisma.product.create({
    data: { name: opts.name ?? `Produto ${n}`, saleType: opts.saleType ?? "unit" },
  });
  const offer = await prisma.offer.create({
    data: {
      storeId: store.id,
      productId: product.id,
      priceCents: opts.priceCents ?? 1000,
      available: opts.available ?? true,
    },
  });
  return { merchantId: merchant.id, storeId: store.id, productId: product.id, offerId: offer.id };
}
