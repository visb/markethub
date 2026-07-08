import { Injectable } from "@nestjs/common";
import { IntegrationService } from "../../integration/integration.service";
import { RefundService } from "../../payment";
import { OrderEvents, OrderTrackingService } from "../../picking";
import { PrismaService } from "../../prisma/prisma.service";
import { SchedulingService } from "../../scheduling";
import type { OrderCanceledPayload } from "../event-types";

/**
 * Side-effects do `order.canceled` (story 48) — antes encadeados inline no
 * OrdersService.cancel pós-TX (liberação do slot + refund com PROVIDER no
 * request do cliente + notificações fire-and-forget): crash entre a TX e o
 * refund deixava pedido cancelado sem estorno. Agora são handlers duráveis com
 * retry isolado (fila própria por handler; ver subscriptions.ts). Idempotentes
 * sob reentrega (além da trava ProcessedEvent): o estorno é 1 por pedido
 * (Refund.orderId @unique; retomada de `pending` reprocessa sem recriar) e a
 * notificação reemite o status ATUAL do grupo (inócuo). O `liberar-slot` é o
 * único que depende só da trava ProcessedEvent — o release é uma operação
 * atômica única (decrement guardado), então não há janela entre efeito parcial
 * e a trava.
 */
@Injectable()
export class OrderCanceledHandlers {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: SchedulingService,
    private readonly refund: RefundService,
    private readonly tracking: OrderTrackingService,
    private readonly integration: IntegrationService,
    private readonly orderEvents: OrderEvents,
  ) {}

  /** Devolve a vaga do slot reservado (S5.3). Pedido sem slot → no-op. */
  async liberarSlot(payload: OrderCanceledPayload): Promise<void> {
    if (!payload.deliverySlotId) return;
    await this.scheduling.release(payload.deliverySlotId);
  }

  /**
   * Estorno integral se o pedido estava pago (guard de "não pago → no-op" vive
   * no RefundService). Falha do provider propaga → BullMQ retenta esta fila;
   * `failed` só no esgotamento (estornoEsgotado).
   */
  async emitirEstorno(payload: OrderCanceledPayload): Promise<void> {
    await this.refund.issueCancelRefund(payload.orderId);
  }

  /**
   * Esgotamento definitivo dos retries do estorno: marca o Refund `failed`
   * (auditável). Chamado pelo listener de job failed do processor.
   */
  async estornoEsgotado(payload: OrderCanceledPayload): Promise<void> {
    await this.refund.markFailed(payload.orderId);
  }

  /**
   * Rastreio agregado (S5.1) + webhook order.status_changed ao merchant
   * (story 09) + socket à store room (story 12), por grupo — com o status
   * ATUAL do grupo (reentrega tardia não crava "canceled").
   */
  async notificar(payload: OrderCanceledPayload): Promise<void> {
    const groups = await this.prisma.orderGroup.findMany({
      where: { orderId: payload.orderId },
      select: { merchantId: true, storeId: true, status: true },
    });
    if (groups.length === 0) return;

    await this.tracking.emit(payload.orderId);
    for (const g of groups) {
      const event = {
        orderId: payload.orderId,
        merchantId: g.merchantId,
        storeId: g.storeId,
        status: g.status,
      };
      await this.integration.emit(g.merchantId, "order.status_changed", event);
      this.orderEvents.statusChanged(event);
    }
  }
}
