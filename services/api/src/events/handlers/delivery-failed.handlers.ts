import { Injectable } from "@nestjs/common";
import { IntegrationService } from "../../integration/integration.service";
import { PushService } from "../../notifications/push.service";
import { OrderEvents } from "../../picking";
import { PrismaService } from "../../prisma/prisma.service";
import type { DeliveryFailedPayload } from "../event-types";

/** Motivo cru → texto legível para o push ao cliente (story 61). */
const REASON_LABEL: Record<DeliveryFailedPayload["reason"], string> = {
  customer_absent: "cliente ausente",
  wrong_address: "endereço não localizado",
  refused: "pedido recusado",
  other: "imprevisto na entrega",
};

/**
 * Side-effects do `delivery.failed` (story 61) — o entregador não conseguiu
 * entregar (cliente ausente, endereço errado, recusa…). Espelha o padrão dos
 * handlers do `order.group_canceled` (story 54): fila própria (retry/backoff
 * isolado; ver subscriptions.ts) atrás da trava ProcessedEvent. Idempotente sob
 * reentrega — relê o estado ATUAL do grupo e reemite (push + realtime são
 * inócuos ao repetir). Grupo removido (cascade) → no-op.
 *
 * NÃO transiciona o OrderGroup (ele NÃO ganha estado novo — painéis derivam a
 * exibição da Delivery); apenas notifica. A decisão (reenviar/cancelar) é da
 * loja, à parte.
 */
@Injectable()
export class DeliveryFailedHandlers {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
    private readonly orderEvents: OrderEvents,
    private readonly push: PushService,
  ) {}

  /**
   * Push ao cliente ("problema na sua entrega: <motivo>, a loja vai entrar em
   * contato") + realtime ao painel merchant (mesmo canal do som/badge da story
   * 54: `order.status_changed` à store room). O status do grupo segue o ATUAL —
   * o board re-deriva a exibição da Delivery (failed) via refetch.
   */
  async notificar(payload: DeliveryFailedPayload): Promise<void> {
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: payload.groupId },
      select: {
        orderId: true,
        merchantId: true,
        storeId: true,
        status: true,
        order: { select: { userId: true } },
      },
    });
    if (!group) return;

    const event = {
      orderId: group.orderId,
      merchantId: group.merchantId,
      storeId: group.storeId,
      status: group.status,
    };
    await this.integration.emit(group.merchantId, "order.status_changed", event);
    this.orderEvents.statusChanged(event);

    await this.push.sendToUser(group.order.userId, {
      title: "Problema na entrega",
      body: `Problema na sua entrega: ${REASON_LABEL[payload.reason]}. A loja vai entrar em contato.`,
      data: { orderId: group.orderId, route: `/track/${group.orderId}` },
    });
  }
}
