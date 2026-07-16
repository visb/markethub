import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { VISIBLE_REVIEWS } from "./review-visibility";

/** Página padrão da vitrine pública de avaliações da loja. */
const STORE_PAGE_SIZE = 10;

/** Primeiro nome do autor (privacidade — não expõe nome completo na vitrine). */
function firstName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "Cliente";
}

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  replyText: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  targetMerchantId: string | null;
  order: { user: { name: string | null } | null } | null;
};

function toPublicItem(r: ReviewRow) {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    authorName: firstName(r.order?.user?.name),
    createdAt: r.createdAt.toISOString(),
    replyText: r.replyText,
    repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
  };
}

function toManagementItem(r: ReviewRow) {
  return {
    ...toPublicItem(r),
    merchantId: r.targetMerchantId,
  };
}

/**
 * Vitrine pública e gestão das avaliações da REDE (story 56). Dono do model
 * `Review` (contexto engagement). O escopo/capability do lojista é resolvido
 * pelo contexto `merchant` (que delega aqui via barrel); esta camada só conhece
 * os `merchantIds` já autorizados.
 */
@Injectable()
export class ReviewsManagementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vitrine pública de uma rede (eixo merchant): média + contagem + página de
   * comentários. Review sem comentário também conta na média e aparece na lista.
   */
  async storeReviews(merchantId: string, page = 1) {
    // moderação (story 68): review oculta pelo admin sai da vitrine E da média
    const where: Prisma.ReviewWhereInput = {
      axis: "merchant",
      targetMerchantId: merchantId,
      ...VISIBLE_REVIEWS,
    };
    const take = STORE_PAGE_SIZE;
    const safePage = page > 0 ? page : 1;
    const skip = (safePage - 1) * take;

    const [agg, items] = await Promise.all([
      this.prisma.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: this.reviewSelect(),
      }),
    ]);

    return {
      average: Math.round((agg._avg.rating ?? 0) * 100) / 100,
      count: agg._count._all,
      page: safePage,
      pageSize: take,
      items: items.map(toPublicItem),
    };
  }

  /**
   * Listagem de gestão do lojista (eixo merchant nas redes do escopo), com
   * comentários. Filtros por nota e por "sem resposta" (`unanswered`).
   */
  async listForManagement(
    merchantIds: string[],
    filter: { rating?: number; unanswered?: boolean } = {},
  ) {
    if (merchantIds.length === 0) return [];
    const where: Prisma.ReviewWhereInput = {
      axis: "merchant",
      targetMerchantId: { in: merchantIds },
      ...(filter.rating ? { rating: filter.rating } : {}),
      ...(filter.unanswered ? { replyText: null } : {}),
    };
    const rows = await this.prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: this.reviewSelect(),
    });
    return rows.map(toManagementItem);
  }

  /**
   * Responde (ou reedita) um review da rede do lojista. Alvo fora do escopo,
   * inexistente ou de outro eixo → 404 (não vaza existência). Sobrescreve a
   * resposta anterior (sem histórico) e carimba `repliedAt`.
   */
  async reply(merchantIds: string[], reviewId: string, text: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, axis: true, targetMerchantId: true },
    });
    if (
      !review ||
      review.axis !== "merchant" ||
      !review.targetMerchantId ||
      !merchantIds.includes(review.targetMerchantId)
    ) {
      throw new NotFoundException({ code: "REVIEW_NOT_FOUND", message: "Avaliação não encontrada" });
    }
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { replyText: text.trim(), repliedAt: new Date() },
      select: this.reviewSelect(),
    });
    return toManagementItem(updated);
  }

  private reviewSelect() {
    return {
      id: true,
      rating: true,
      comment: true,
      replyText: true,
      repliedAt: true,
      createdAt: true,
      targetMerchantId: true,
      order: { select: { user: { select: { name: true } } } },
    } satisfies Prisma.ReviewSelect;
  }
}
