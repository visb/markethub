import { Injectable } from "@nestjs/common";
import type { ReviewAxis } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VISIBLE_REVIEWS } from "./review-visibility";

/**
 * Agregações de avaliação e gorjeta (S5.2) — consumidas pelo dashboard admin
 * (S5.4) e pela área do merchant. Médias por eixo/alvo e total de gorjetas pagas.
 */
@Injectable()
export class ReviewsAggregateService {
  constructor(private readonly prisma: PrismaService) {}

  /** Média da plataforma (eixo platform). */
  platform() {
    return this.avg({ axis: "platform" });
  }

  /** Médias de um merchant (eixos merchant e delivery dos seus pedidos). */
  async merchant(merchantId: string) {
    const [merchant, delivery] = await Promise.all([
      this.avg({ axis: "merchant", targetMerchantId: merchantId }),
      this.avg({ axis: "delivery", targetMerchantId: merchantId }),
    ]);
    return { merchant, delivery };
  }

  /** Média do entregador (eixo delivery) + total de gorjetas pagas no período. */
  async driver(driverId: string, range?: { from?: Date; to?: Date }) {
    const rating = await this.avg({ axis: "delivery", targetDriverId: driverId });
    const tips = await this.tipsTotal(driverId, range);
    return { rating, tips };
  }

  /** Total de gorjetas pagas por entregador (opcional período). */
  async tipsTotal(driverId: string, range?: { from?: Date; to?: Date }) {
    const agg = await this.prisma.tip.aggregate({
      where: {
        driverId,
        status: "paid",
        ...(range?.from || range?.to
          ? { paidAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
          : {}),
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    });
    return { totalCents: agg._sum.amountCents ?? 0, count: agg._count._all };
  }

  private async avg(where: {
    axis: ReviewAxis;
    targetMerchantId?: string;
    targetDriverId?: string;
  }) {
    // moderação (story 68): review oculta pelo admin não conta em NENHUMA média
    const agg = await this.prisma.review.aggregate({
      where: { ...where, ...VISIBLE_REVIEWS },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return {
      axis: where.axis,
      average: Math.round((agg._avg.rating ?? 0) * 100) / 100,
      count: agg._count._all,
    };
  }
}
