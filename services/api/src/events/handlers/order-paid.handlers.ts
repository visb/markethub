import { Injectable } from "@nestjs/common";
import { ErpService } from "../../erp";
import { IntegrationService } from "../../integration/integration.service";
import { OrderEvents, OrderTrackingService, PickingService } from "../../picking";
import { PrismaService } from "../../prisma/prisma.service";
import type { OrderPaidPayload } from "../event-types";

/**
 * Side-effects do `order.paid` (story 45) — antes inline no OrdersService.markPaid,
 * agora handlers independentes com retry isolado (fila própria por handler; ver
 * subscriptions.ts). O payload traz só o orderId — cada handler relê o estado
 * atual do banco. Todos idempotentes sob reentrega (além da trava ProcessedEvent):
 * pushOrderGroup ignora grupo com erpPushedAt; generateForOrder só cria PickTask
 * onde não existe; notificar reemite o STATUS ATUAL do grupo (inócuo).
 */
@Injectable()
export class OrderPaidHandlers {
  constructor(
    private readonly prisma: PrismaService,
    private readonly erp: ErpService,
    private readonly picking: PickingService,
    private readonly tracking: OrderTrackingService,
    private readonly integration: IntegrationService,
    private readonly orderEvents: OrderEvents,
  ) {}

  /** Empurra cada grupo do pedido ao ERP da loja (S2.7). */
  async pushErp(payload: OrderPaidPayload): Promise<void> {
    const groups = await this.prisma.orderGroup.findMany({
      where: { orderId: payload.orderId },
      select: { id: true },
    });
    for (const g of groups) await this.erp.pushOrderGroup(g.id);
  }

  /** Gera as tarefas de separação (queued) p/ os separadores assumirem (S3.2). */
  async gerarPicking(payload: OrderPaidPayload): Promise<void> {
    await this.picking.generateForOrder(payload.orderId);
  }

  /**
   * Rastreio realtime (S5.1) + webhook order.status_changed (story 09) + socket
   * à store room (story 12), por grupo — com o status ATUAL do grupo.
   */
  async notificar(payload: OrderPaidPayload): Promise<void> {
    await this.tracking.emit(payload.orderId);
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
      await this.integration.emit(g.merchantId, "order.status_changed", event);
      this.orderEvents.statusChanged(event);
    }
  }
}
