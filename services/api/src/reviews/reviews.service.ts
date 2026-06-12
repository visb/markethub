import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ReviewAxis } from "@prisma/client";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

interface CreateReviewInput {
  axis: ReviewAxis;
  rating: number;
  comment?: string;
  /** Eixo merchant em pedido multi-loja: qual mercado está sendo avaliado. */
  merchantId?: string;
}

/**
 * Avaliações multi-eixo (S5.2). Só o dono pode avaliar um pedido `delivered`,
 * dentro da janela configurável. O eixo `delivery` só se aplica quando houve
 * entrega própria com entregador. Unicidade por (orderId, axis, merchant):
 * platform/delivery uma vez por pedido; merchant uma vez por mercado do pedido.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Avaliações já registradas do pedido (p/ a UI saber o que falta). */
  async listForOrder(userId: string, orderId: string) {
    await this.assertOwnedDelivered(userId, orderId);
    const reviews = await this.prisma.review.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
    });
    return reviews.map(toReviewDto);
  }

  async create(userId: string, orderId: string, input: CreateReviewInput) {
    if (input.rating < 1 || input.rating > 5) {
      throw new BadRequestException({ code: "INVALID_RATING", message: "Nota deve ser de 1 a 5" });
    }
    const order = await this.assertOwnedDelivered(userId, orderId);
    const targets = this.resolveTargets(order, input.axis, input.merchantId);

    const existing = await this.prisma.review.findFirst({
      where: {
        orderId,
        axis: input.axis,
        ...(input.axis === "merchant" ? { targetMerchantId: targets.merchantId } : {}),
      },
    });
    if (existing) {
      throw new BadRequestException({
        code: "ALREADY_REVIEWED",
        message: "Este eixo já foi avaliado neste pedido",
      });
    }

    const review = await this.prisma.review.create({
      data: {
        orderId,
        axis: input.axis,
        rating: input.rating,
        comment: input.comment?.trim() || null,
        targetMerchantId: targets.merchantId,
        targetDriverId: targets.driverId,
      },
    });
    return toReviewDto(review);
  }

  /** Resolve os alvos da avaliação a partir dos grupos/entrega do pedido. */
  private resolveTargets(
    order: OrderWithGroups,
    axis: ReviewAxis,
    merchantId?: string,
  ): { merchantId: string | null; driverId: string | null } {
    if (axis === "platform") return { merchantId: null, driverId: null };
    if (axis === "merchant") {
      // multi-loja: o cliente indica qual mercado; default = primeiro grupo
      const target = merchantId ?? order.groups[0]?.merchantId ?? null;
      if (target && !order.groups.some((g) => g.merchantId === target)) {
        throw new BadRequestException({
          code: "MERCHANT_NOT_IN_ORDER",
          message: "Mercado não faz parte deste pedido",
        });
      }
      return { merchantId: target, driverId: null };
    }
    // delivery: exige entrega própria com entregador atribuído
    const driverId = order.groups
      .map((g) => (g.fulfillment === "delivery" ? g.delivery?.driverId ?? null : null))
      .find((d): d is string => !!d);
    if (!driverId) {
      throw new BadRequestException({
        code: "DELIVERY_AXIS_NA",
        message: "Avaliação de entrega não se aplica a este pedido",
      });
    }
    return { merchantId: order.groups[0]?.merchantId ?? null, driverId };
  }

  private async assertOwnedDelivered(userId: string, orderId: string): Promise<OrderWithGroups> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        updatedAt: true,
        groups: {
          select: {
            merchantId: true,
            fulfillment: true,
            delivery: { select: { driverId: true } },
          },
        },
      },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado" });
    }
    if (order.status !== "delivered") {
      throw new BadRequestException({
        code: "ORDER_NOT_DELIVERED",
        message: "Só é possível avaliar pedidos entregues",
      });
    }
    const windowDays = this.config.get("REVIEW_WINDOW_DAYS", { infer: true });
    const ageMs = Date.now() - order.updatedAt.getTime();
    if (ageMs > windowDays * 86400_000) {
      throw new BadRequestException({
        code: "REVIEW_WINDOW_CLOSED",
        message: "Janela de avaliação encerrada",
      });
    }
    return order;
  }
}

type OrderWithGroups = {
  id: string;
  userId: string;
  status: string;
  updatedAt: Date;
  groups: { merchantId: string; fulfillment: string; delivery: { driverId: string | null } | null }[];
};

function toReviewDto(r: {
  id: string;
  orderId: string;
  axis: ReviewAxis;
  rating: number;
  comment: string | null;
  targetMerchantId: string | null;
  targetDriverId: string | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    orderId: r.orderId,
    axis: r.axis,
    rating: r.rating,
    comment: r.comment,
    targetMerchantId: r.targetMerchantId,
    targetDriverId: r.targetDriverId,
    createdAt: r.createdAt.toISOString(),
  };
}
