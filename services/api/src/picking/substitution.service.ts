import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PushService } from "../notifications/push.service";
import { PrismaService } from "../prisma/prisma.service";
import { PickingSessionService } from "./picking-session.service";
import { PickingEvents } from "./picking.events";

/**
 * Substituição de item sem estoque (S3.4). O separador propõe um Offer da mesma
 * loja; o cliente aprova/recusa. Sem resposta dentro da janela, a política de
 * timeout resolve: aceita se o substituto for até X% mais barato, senão remove.
 */
@Injectable()
export class SubstitutionService {
  private readonly logger = new Logger(SubstitutionService.name);

  /** Janela de aprovação antes da política de timeout agir. */
  static readonly TIMEOUT_MINUTES = 15;
  /** Em timeout, aceita automaticamente substituto até este % mais barato. */
  static readonly AUTO_ACCEPT_MAX_CHEAPER_PCT = 100; // qualquer um mais barato/igual

  constructor(
    private readonly prisma: PrismaService,
    private readonly session: PickingSessionService,
    private readonly events: PickingEvents,
    private readonly push: PushService,
  ) {}

  /** Separador propõe um substituto (Offer da mesma loja) para um PickItem. */
  async propose(userId: string, taskId: string, itemId: string, substituteOfferId: string) {
    const task = await this.prisma.pickTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException({ code: "PICK_TASK_NOT_FOUND", message: "Tarefa não encontrada" });
    if (task.pickerId !== userId) {
      throw new ForbiddenException({ code: "NOT_TASK_OWNER", message: "Tarefa não é sua" });
    }
    if (task.status !== "picking") {
      throw new BadRequestException({
        code: "PICK_TASK_NOT_PICKING",
        message: "Inicie a separação antes de propor substituições",
      });
    }

    const item = await this.prisma.pickItem.findFirst({
      where: { id: itemId, pickTaskId: taskId },
      include: { orderItem: true },
    });
    if (!item) throw new NotFoundException({ code: "PICK_ITEM_NOT_FOUND", message: "Item não encontrado" });

    const offer = await this.prisma.offer.findUnique({
      where: { id: substituteOfferId },
      include: { product: { select: { name: true } } },
    });
    if (!offer || offer.storeId !== task.storeId) {
      throw new BadRequestException({
        code: "INVALID_SUBSTITUTE",
        message: "Substituto deve ser uma oferta da mesma loja",
      });
    }
    if (!offer.available) {
      throw new BadRequestException({ code: "SUBSTITUTE_UNAVAILABLE", message: "Substituto indisponível" });
    }

    const unitPriceCents = offer.promoPriceCents ?? offer.priceCents;
    const priceDiffCents = unitPriceCents - item.orderItem.unitPriceCents;

    const sub = await this.prisma.substitution.upsert({
      where: { pickItemId: itemId },
      create: {
        pickItemId: itemId,
        substituteOfferId: offer.id,
        substituteProductId: offer.productId,
        nameSnapshot: offer.product.name,
        unitPriceCents,
        priceDiffCents,
        approvalStatus: "pending",
      },
      // re-proposta antes da aprovação: substitui a anterior e volta a pending
      update: {
        substituteOfferId: offer.id,
        substituteProductId: offer.productId,
        nameSnapshot: offer.product.name,
        unitPriceCents,
        priceDiffCents,
        approvalStatus: "pending",
        resolvedAt: null,
      },
    });

    this.events.substitutionProposed({
      id: sub.id,
      pickItemId: itemId,
      orderGroupId: task.orderGroupId,
    });
    // push ao cliente p/ aprovar/recusar (S5.6)
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: task.orderGroupId },
      select: { orderId: true, order: { select: { userId: true } } },
    });
    if (group) {
      await this.push.sendToUser(group.order.userId, {
        title: "Substituição pendente",
        body: `Um item foi substituído por ${offer.product.name}. Aprove ou recuse.`,
        data: { orderId: group.orderId },
      });
    }
    return sub;
  }

  /** Substituições pendentes de um pedido do cliente (para aprovar/recusar). */
  async listForOrder(userId: string, orderId: string) {
    await this.assertOrderOwner(userId, orderId);
    const subs = await this.prisma.substitution.findMany({
      where: {
        approvalStatus: "pending",
        pickItem: { pickTask: { orderGroup: { orderId } } },
      },
      include: { pickItem: { include: { orderItem: true } } },
    });
    return subs.map((s) => ({
      id: s.id,
      pickItemId: s.pickItemId,
      originalName: s.pickItem.orderItem.nameSnapshot,
      originalUnitPriceCents: s.pickItem.orderItem.unitPriceCents,
      substituteName: s.nameSnapshot,
      substituteUnitPriceCents: s.unitPriceCents,
      priceDiffCents: s.priceDiffCents,
      approvalStatus: s.approvalStatus,
    }));
  }

  /** Cliente aprova: item → substituted, recalcula totais. */
  async approve(userId: string, orderId: string, substitutionId: string) {
    await this.assertOrderOwner(userId, orderId);
    return this.resolve(substitutionId, "approved");
  }

  /** Cliente recusa: item → refused (removido), recalcula totais. */
  async reject(userId: string, orderId: string, substitutionId: string) {
    await this.assertOrderOwner(userId, orderId);
    return this.resolve(substitutionId, "rejected");
  }

  /**
   * Política de timeout: substituições pendentes além da janela são resolvidas
   * automaticamente — aceita se o substituto for mais barato (dentro do limite),
   * senão remove. Chamado por scheduler (S3.4 nota).
   */
  async resolveExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - SubstitutionService.TIMEOUT_MINUTES * 60_000);
    const expired = await this.prisma.substitution.findMany({
      where: { approvalStatus: "pending", createdAt: { lt: cutoff } },
    });

    for (const sub of expired) {
      const decision = sub.priceDiffCents <= 0 ? "approved" : "rejected";
      try {
        await this.resolve(sub.id, decision);
      } catch (err) {
        this.logger.warn(`falha ao resolver substituição ${sub.id}: ${String(err)}`);
      }
    }
    return expired.length;
  }

  private async resolve(substitutionId: string, decision: "approved" | "rejected") {
    const sub = await this.prisma.substitution.findUnique({
      where: { id: substitutionId },
      include: { pickItem: true },
    });
    if (!sub) throw new NotFoundException({ code: "SUBSTITUTION_NOT_FOUND", message: "Substituição não encontrada" });
    if (sub.approvalStatus !== "pending") {
      // idempotente: já resolvida
      return sub;
    }

    const orderGroupId = (
      await this.prisma.pickTask.findUniqueOrThrow({
        where: { id: sub.pickItem.pickTaskId },
        select: { orderGroupId: true },
      })
    ).orderGroupId;

    await this.prisma.$transaction([
      this.prisma.substitution.update({
        where: { id: substitutionId },
        data: { approvalStatus: decision, resolvedAt: new Date() },
      }),
      this.prisma.pickItem.update({
        where: { id: sub.pickItemId },
        data: { status: decision === "approved" ? "substituted" : "refused" },
      }),
    ]);

    await this.session.recalcTotals(orderGroupId);

    this.events.substitutionResolved({
      id: sub.id,
      pickItemId: sub.pickItemId,
      orderGroupId,
      approvalStatus: decision,
    });
    return this.prisma.substitution.findUniqueOrThrow({ where: { id: substitutionId } });
  }

  private async assertOrderOwner(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== userId) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado" });
    }
    return order;
  }
}
