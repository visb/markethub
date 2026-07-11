import { Injectable } from "@nestjs/common";
import { IntegrationService } from "../../integration/integration.service";
import { PushService } from "../../notifications/push.service";
import { RefundService } from "../../payment";
import { OrderEvents, OrderTrackingService } from "../../picking";
import { PrismaService } from "../../prisma/prisma.service";
import type { OrderGroupCanceledPayload } from "../event-types";

/**
 * Side-effects do `order.group_canceled` (story 54) — cancelamento de UM
 * sub-pedido (OrderGroup) pela loja/marketplace. Espelha os handlers do
 * `order.canceled` (story 48), mas o estorno é PARCIAL (valor do grupo, já
 * rateado no payload) e ACUMULA no Refund 1:1 do pedido. Filas próprias por
 * handler (retry/backoff isolados; ver subscriptions.ts); idempotentes sob
 * reentrega além da trava ProcessedEvent (o estorno faz short-circuit se o
 * RefundComponent do grupo já existe; a notificação reemite o estado ATUAL).
 */
@Injectable()
export class OrderGroupCanceledHandlers {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refund: RefundService,
    private readonly tracking: OrderTrackingService,
    private readonly integration: IntegrationService,
    private readonly orderEvents: OrderEvents,
    private readonly push: PushService,
  ) {}

  /**
   * Estorno parcial do grupo cancelado (valor já rateado no payload). Delega ao
   * RefundService, que acumula o RefundComponent e dispara o estorno no gateway.
   * Falha do provider propaga → BullMQ retenta só esta fila; `failed` só no
   * esgotamento (estornoEsgotado).
   */
  async emitirEstorno(payload: OrderGroupCanceledPayload): Promise<void> {
    await this.refund.issueGroupCancelRefund(
      payload.orderId,
      payload.groupId,
      payload.amountCents,
      payload.reason,
    );
  }

  /** Esgotamento dos retries do estorno → Refund do pedido `failed` (auditável). */
  async estornoEsgotado(payload: OrderGroupCanceledPayload): Promise<void> {
    await this.refund.markFailed(payload.orderId);
  }

  /**
   * Rastreio agregado (S5.1) + webhook order.status_changed ao merchant
   * (story 09) + socket à store room (story 12) — com o status ATUAL do grupo —
   * e push ao cliente avisando que os itens da loja foram cancelados e estornados
   * (S5.6). Grupo removido (cascade) → no-op.
   */
  async notificar(payload: OrderGroupCanceledPayload): Promise<void> {
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: payload.groupId },
      select: {
        orderId: true,
        merchantId: true,
        storeId: true,
        status: true,
        store: { select: { name: true } },
        order: { select: { userId: true } },
      },
    });
    if (!group) return;

    await this.tracking.emit(group.orderId);

    const event = {
      orderId: group.orderId,
      merchantId: group.merchantId,
      storeId: group.storeId,
      status: group.status,
    };
    await this.integration.emit(group.merchantId, "order.status_changed", event);
    this.orderEvents.statusChanged(event);

    await this.push.sendToUser(group.order.userId, {
      title: "Itens cancelados",
      body: `Os itens de ${group.store.name} foram cancelados e o valor estornado.`,
      data: { orderId: group.orderId, route: `/track/${group.orderId}` },
    });
  }
}
