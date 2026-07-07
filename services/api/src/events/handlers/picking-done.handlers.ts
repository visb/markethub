import { Injectable } from "@nestjs/common";
import { IntegrationService } from "../../integration/integration.service";
import { PushService } from "../../notifications/push.service";
import { OrderEvents, OrderTrackingService, PickingEvents } from "../../picking";
import { PrismaService } from "../../prisma/prisma.service";
import type { PickingDonePayload } from "../event-types";

/**
 * Side-effects do `picking.done` (story 46) — antes encadeados inline no
 * HandoffService.markReady (criação da Delivery na TX + notificações
 * fire-and-forget pós-commit), agora handlers duráveis com retry isolado (fila
 * própria por handler; ver subscriptions.ts). O payload traz só o orderGroupId
 * — cada handler relê o estado atual. Idempotentes sob reentrega (além da
 * trava ProcessedEvent): a Delivery é upsert por orderGroupId @unique com
 * update vazio (não reabre/reseta entrega já iniciada) e a notificação reemite
 * o status ATUAL do grupo (inócuo).
 */
@Injectable()
export class PickingDoneHandlers {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: OrderTrackingService,
    private readonly integration: IntegrationService,
    private readonly orderEvents: OrderEvents,
    private readonly pickingEvents: PickingEvents,
    private readonly push: PushService,
  ) {}

  /**
   * Início da entrega own-store (S3.6/Fase 4): cria a Delivery (unassigned)
   * p/ a loja atribuir um entregador. Retirada na loja (pickup) não gera
   * entrega; grupo cancelado nesse meio-tempo também não. Reentrega não reabre
   * entrega já iniciada (upsert com update vazio).
   */
  async iniciarEntrega(payload: PickingDonePayload): Promise<void> {
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: payload.orderGroupId },
      select: { fulfillment: true, storeId: true, status: true },
    });
    if (!group || group.fulfillment !== "delivery" || group.status === "canceled") return;
    await this.prisma.delivery.upsert({
      where: { orderGroupId: payload.orderGroupId },
      create: { orderGroupId: payload.orderGroupId, storeId: group.storeId },
      update: {},
    });
  }

  /**
   * Rastreio agregado (S5.1) + webhook order.status_changed ao merchant
   * (story 09) + sockets (store room story 12; fila de coleta S3.8) + push ao
   * dono (S5.6) — com o status ATUAL do grupo.
   */
  async notificar(payload: PickingDonePayload): Promise<void> {
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: payload.orderGroupId },
      select: {
        orderId: true,
        merchantId: true,
        storeId: true,
        status: true,
        fulfillment: true,
        order: { select: { userId: true } },
      },
    });
    if (!group) return;

    await this.tracking.recomputeAndEmit(payload.orderGroupId);

    const event = {
      orderId: group.orderId,
      merchantId: group.merchantId,
      storeId: group.storeId,
      status: group.status,
    };
    await this.integration.emit(group.merchantId, "order.status_changed", event);
    this.orderEvents.statusChanged(event);

    const task = await this.prisma.pickTask.findUnique({
      where: { orderGroupId: payload.orderGroupId },
      select: { id: true, storeId: true },
    });
    if (task) {
      this.pickingEvents.readyForPickup({
        pickTaskId: task.id,
        storeId: task.storeId,
        orderGroupId: payload.orderGroupId,
      });
    }

    await this.push.sendToUser(group.order.userId, {
      title: "Pedido pronto",
      body:
        group.fulfillment === "pickup"
          ? "Seu pedido está pronto para retirada na loja."
          : "Seu pedido foi separado e aguarda coleta.",
      data: { orderId: group.orderId },
    });
  }
}
