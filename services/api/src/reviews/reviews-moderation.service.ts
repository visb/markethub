import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, ReviewAxis } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Filtros da listagem plana de moderação (story 68). `hidden` undefined = todas. */
export interface AdminReviewsListFilter {
  rating?: number;
  hidden?: boolean;
  merchantId?: string;
  q?: string;
}

type ModerationRow = {
  id: string;
  orderId: string;
  axis: ReviewAxis;
  rating: number;
  comment: string | null;
  replyText: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  targetMerchantId: string | null;
  hiddenAt: Date | null;
  hiddenById: string | null;
  hiddenReason: string | null;
  order: { user: { name: string | null } | null } | null;
};

/**
 * Moderação de avaliações pelo admin (story 68). Dono do model `Review`
 * (contexto engagement) — o contexto admin delega aqui via barrel. Soft-hide
 * REVERSÍVEL: nunca deleta; oculta sai da vitrine/médias (`VISIBLE_REVIEWS`).
 * Autor não é notificado (decisão travada — silencioso).
 */
@Injectable()
export class ReviewsModerationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Listagem plana p/ o admin: comentário, autor, pedido, merchant alvo e estado. */
  async list(filter: AdminReviewsListFilter = {}) {
    const where: Prisma.ReviewWhereInput = {
      ...(filter.rating ? { rating: filter.rating } : {}),
      ...(filter.hidden === true ? { hiddenAt: { not: null } } : {}),
      ...(filter.hidden === false ? { hiddenAt: null } : {}),
      ...(filter.merchantId ? { targetMerchantId: filter.merchantId } : {}),
      ...(filter.q ? { comment: { contains: filter.q, mode: "insensitive" as const } } : {}),
    };
    const rows = await this.prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: this.select(),
    });
    return this.toDtos(rows);
  }

  /**
   * Oculta (soft-hide) com motivo obrigatório e trilha de quem ocultou.
   * Idempotente: já oculta → devolve como está (não sobrescreve a trilha).
   */
  async hide(reviewId: string, adminId: string, reason: string) {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new BadRequestException({
        code: "HIDE_REASON_REQUIRED",
        message: "Motivo é obrigatório para ocultar uma avaliação",
      });
    }
    const review = await this.getOr404(reviewId);
    if (review.hiddenAt) return (await this.toDtos([review]))[0];
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { hiddenAt: new Date(), hiddenById: adminId, hiddenReason: trimmed },
      select: this.select(),
    });
    return (await this.toDtos([updated]))[0];
  }

  /** Reexibe uma review oculta. Idempotente: visível → devolve como está. */
  async unhide(reviewId: string) {
    const review = await this.getOr404(reviewId);
    if (!review.hiddenAt) return (await this.toDtos([review]))[0];
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { hiddenAt: null, hiddenById: null, hiddenReason: null },
      select: this.select(),
    });
    return (await this.toDtos([updated]))[0];
  }

  private async getOr404(reviewId: string): Promise<ModerationRow> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: this.select(),
    });
    if (!review) {
      throw new NotFoundException({ code: "REVIEW_NOT_FOUND", message: "Avaliação não encontrada" });
    }
    return review;
  }

  /** Resolve nomes (merchant alvo + admin que ocultou) em lote — weak refs sem FK. */
  private async toDtos(rows: ModerationRow[]) {
    const merchantIds = [...new Set(rows.map((r) => r.targetMerchantId).filter(isString))];
    const adminIds = [...new Set(rows.map((r) => r.hiddenById).filter(isString))];
    const [merchants, admins] = await Promise.all([
      merchantIds.length
        ? this.prisma.merchant.findMany({
            where: { id: { in: merchantIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      adminIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: adminIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const merchantName = new Map(merchants.map((m) => [m.id, m.name]));
    const adminName = new Map(admins.map((u) => [u.id, u.name]));

    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      axis: r.axis,
      rating: r.rating,
      comment: r.comment,
      authorName: r.order?.user?.name ?? "Cliente",
      createdAt: r.createdAt.toISOString(),
      replyText: r.replyText,
      repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
      merchantId: r.targetMerchantId,
      merchantName: r.targetMerchantId ? merchantName.get(r.targetMerchantId) ?? null : null,
      hidden: Boolean(r.hiddenAt),
      hiddenAt: r.hiddenAt ? r.hiddenAt.toISOString() : null,
      hiddenReason: r.hiddenReason,
      hiddenByName: r.hiddenById ? adminName.get(r.hiddenById) ?? null : null,
    }));
  }

  private select() {
    return {
      id: true,
      orderId: true,
      axis: true,
      rating: true,
      comment: true,
      replyText: true,
      repliedAt: true,
      createdAt: true,
      targetMerchantId: true,
      hiddenAt: true,
      hiddenById: true,
      hiddenReason: true,
      order: { select: { user: { select: { name: true } } } },
    } satisfies Prisma.ReviewSelect;
  }
}

function isString(v: string | null): v is string {
  return typeof v === "string" && v.length > 0;
}
