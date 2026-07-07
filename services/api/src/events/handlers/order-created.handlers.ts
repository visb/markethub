import { Injectable } from "@nestjs/common";
import { IntegrationService } from "../../integration/integration.service";
import { PixChargeService } from "../../payment/pix-charge.service";
import { OrderEvents } from "../../picking/order.events";
import { PrismaService } from "../../prisma/prisma.service";
import type { OrderCreatedPayload } from "../event-types";

/**
 * Side-effects do `order.created` (story 46) — antes o webhook/socket era
 * fire-and-forget pós-commit no OrdersService.checkout e a cobrança PIX só
 * nascia quando o cliente chamava POST /orders/:id/pay. Agora são handlers
 * duráveis com retry isolado (fila própria; ver subscriptions.ts). O payload
 * traz só o orderId — cada handler relê o estado atual. Idempotentes sob
 * reentrega (além da trava ProcessedEvent): a cobrança reaproveita a pendente
 * válida (Payment.orderId @unique) e a notificação reemite o status ATUAL do
 * grupo (inócuo).
 */
@Injectable()
export class OrderCreatedHandlers {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pixCharge: PixChargeService,
    private readonly integration: IntegrationService,
    private readonly orderEvents: OrderEvents,
  ) {}

  /**
   * Gera a cobrança PIX do pedido no gateway (provider atrás de interface).
   * Pedido que já saiu de `created` (pago/cancelado) → no-op; cobrança pendente
   * válida existente → short-circuit dentro do PixChargeService.
   */
  async gerarCobrancaPix(payload: OrderCreatedPayload): Promise<void> {
    await this.pixCharge.ensureForOrder(payload.orderId);
  }

  /**
   * Webhook outbound `order.created` ao merchant (story 09) + socket à store
   * room (story 12), por grupo do pedido — com o status ATUAL do grupo.
   */
  async notificar(payload: OrderCreatedPayload): Promise<void> {
    const groups = await this.prisma.orderGroup.findMany({
      where: { orderId: payload.orderId },
      select: { merchantId: true, storeId: true, status: true },
    });
    for (const g of groups) {
      const event = {
        orderId: payload.orderId,
        merchantId: g.merchantId,
        storeId: g.storeId,
        status: g.status,
      };
      await this.integration.emit(g.merchantId, "order.created", event);
      this.orderEvents.created(event);
    }
  }
}
