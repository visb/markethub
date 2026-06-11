import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Favoritos de oferta (S6.5): referência viva à Offer (produto numa loja) — preço e
 * disponibilidade sempre atuais na listagem.
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async add(userId: string, offerId: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) {
      throw new BadRequestException({ code: "OFFER_NOT_FOUND", message: "Oferta não encontrada" });
    }
    return this.prisma.favorite.upsert({
      where: { userId_offerId: { userId, offerId } },
      update: {},
      create: { userId, offerId },
    });
  }

  async remove(userId: string, offerId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, offerId } });
    return { offerId, removed: true };
  }

  async list(userId: string) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        offer: {
          select: {
            id: true,
            priceCents: true,
            promoPriceCents: true,
            available: true,
            product: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
                saleType: true,
                packageSize: true,
              },
            },
            store: {
              select: {
                id: true,
                name: true,
                merchant: { select: { name: true, logoUrl: true } },
              },
            },
          },
        },
      },
    });
    return rows.map((f) => ({
      offerId: f.offerId,
      createdAt: f.createdAt.toISOString(),
      priceCents: f.offer.priceCents,
      promoPriceCents: f.offer.promoPriceCents,
      available: f.offer.available,
      product: f.offer.product,
      store: {
        id: f.offer.store.id,
        name: f.offer.store.name,
        merchantName: f.offer.store.merchant.name,
        merchantLogoUrl: f.offer.store.merchant.logoUrl,
      },
    }));
  }
}
