import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OutboxPublisher } from "../events";
import { OrdersService } from "../marketplace";
import { PrismaService } from "../prisma/prisma.service";

/** Item da timeline do pedido (story 67): merge outbox + marcos de timestamps, ordenado. */
export interface OrderTimelineItem {
  at: string;
  kind: string;
  label: string;
  meta: Record<string, unknown> | null;
}

/** Rótulos pt-BR dos eventos do outbox exibidos na timeline. */
const EVENT_LABELS: Record<string, string> = {
  "order.created": "Pedido criado",
  "order.paid": "Pagamento confirmado",
  "picking.done": "Separação concluída",
  "order.canceled": "Pedido cancelado",
  "order.group_canceled": "Sub-pedido cancelado",
  "delivery.failed": "Falha na entrega",
  "order.refund_requested": "Reembolso manual solicitado",
};

/**
 * Ferramentas de suporte do detalhe do pedido no admin (story 67): timeline
 * (outbox + marcos), cancelamento admin (delegado ao marketplace, dono do
 * agregado) e reembolso manual parcial (evento durável `order.refund_requested`).
 */
@Injectable()
export class AdminOrderSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly outbox: OutboxPublisher,
  ) {}

  /**
   * Timeline vertical do pedido: merge dos eventos do outbox (`aggregateId =
   * orderId`) com os marcos de timestamps do pedido/separação/entrega, ordenado
   * cronologicamente. Pedido sem eventos ainda rende os marcos (ao menos o
   * "Pedido criado").
   */
  async timeline(orderId: string): Promise<OrderTimelineItem[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        createdAt: true,
        payment: { select: { paidAt: true } },
        groups: {
          select: {
            id: true,
            store: { select: { name: true } },
            pickTask: { select: { startedAt: true, readyAt: true } },
            delivery: {
              select: {
                assignedAt: true,
                pickedUpAt: true,
                deliveredAt: true,
                failedAt: true,
                failReason: true,
                failNote: true,
                driver: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado" });
    }

    const items: OrderTimelineItem[] = [
      { at: order.createdAt.toISOString(), kind: "milestone.created", label: "Pedido criado", meta: null },
    ];
    if (order.payment?.paidAt) {
      items.push({
        at: order.payment.paidAt.toISOString(),
        kind: "milestone.paid",
        label: "Pagamento confirmado",
        meta: null,
      });
    }
    for (const g of order.groups) {
      const store = g.store.name;
      const push = (at: Date | null | undefined, kind: string, label: string, extra?: Record<string, unknown>) => {
        if (!at) return;
        items.push({ at: at.toISOString(), kind, label: `${label} — ${store}`, meta: { groupId: g.id, store, ...extra } });
      };
      push(g.pickTask?.startedAt, "milestone.picking", "Separação iniciada");
      push(g.pickTask?.readyAt, "milestone.ready", "Pronto para coleta/retirada");
      push(g.delivery?.assignedAt, "milestone.delivery_assigned", "Entregador atribuído", {
        driver: g.delivery?.driver?.name ?? null,
      });
      push(g.delivery?.pickedUpAt, "milestone.on_the_way", "Saiu para entrega", {
        driver: g.delivery?.driver?.name ?? null,
      });
      push(g.delivery?.deliveredAt, "milestone.delivered", "Entregue");
      push(g.delivery?.failedAt, "milestone.delivery_failed", "Falha na entrega", {
        failReason: g.delivery?.failReason ?? null,
        failNote: g.delivery?.failNote ?? null,
      });
    }

    const events = await this.prisma.outboxEvent.findMany({
      where: { aggregateId: orderId },
      orderBy: { createdAt: "asc" },
      select: { type: true, payload: true, createdAt: true },
    });
    for (const e of events) {
      items.push({
        at: e.createdAt.toISOString(),
        kind: `event.${e.type}`,
        label: EVENT_LABELS[e.type] ?? e.type,
        meta: (e.payload as Record<string, unknown> | null) ?? null,
      });
    }

    return items.sort((a, b) => a.at.localeCompare(b.at));
  }

  /**
   * Cancelamento pelo suporte: delega ao marketplace (dono do agregado Order),
   * que aplica a regra de override admin (qualquer status não-terminal) e emite
   * `order.canceled` → estorno TOTAL durável (handlers da story 48).
   */
  cancel(orderId: string, reason?: string | null) {
    return this.orders.adminCancel(orderId, reason ?? null);
  }

  /**
   * Reembolso manual parcial (story 67): valor arbitrário por grupo, limitado ao
   * teto = pago − já reembolsado (Refund não-failed). Valida e emite
   * `order.refund_requested` no outbox — o handler cria o `RefundComponent`
   * (reason `manual`, `createdById` = admin) e dispara o estorno parcial durável
   * no gateway (mesmo mecanismo 48/54). `componentId` gerado aqui é a identidade
   * do componente (idempotência da reentrega).
   */
  async manualRefund(
    orderId: string,
    adminId: string,
    input: { orderGroupId: string; amountCents: number; note?: string | null },
  ) {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException({
        code: "INVALID_REFUND_AMOUNT",
        message: "Valor do reembolso deve ser um inteiro em centavos maior que zero",
      });
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        payment: { select: { status: true, amountCents: true } },
        refund: { select: { status: true, amountCents: true } },
        groups: { select: { id: true } },
      },
    });
    if (!order) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado" });
    }
    if (!order.groups.some((g) => g.id === input.orderGroupId)) {
      throw new NotFoundException({
        code: "ORDER_GROUP_NOT_FOUND",
        message: "Sub-pedido não pertence a este pedido",
      });
    }
    if (!order.payment || order.payment.status !== "paid") {
      throw new BadRequestException({
        code: "ORDER_NOT_PAID",
        message: "Só é possível reembolsar pedido pago",
      });
    }

    // teto: pago − já reembolsado (refund failed não conta — nada saiu do gateway)
    const refundedCents =
      order.refund && order.refund.status !== "failed" ? order.refund.amountCents : 0;
    const remainingCents = order.payment.amountCents - refundedCents;
    if (input.amountCents > remainingCents) {
      throw new BadRequestException({
        code: "REFUND_EXCEEDS_PAID",
        message: `Valor excede o teto reembolsável (restam ${remainingCents} centavos)`,
      });
    }

    const componentId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.publish(tx, {
        type: "order.refund_requested",
        payload: {
          orderId,
          groupId: input.orderGroupId,
          amountCents: input.amountCents,
          componentId,
          createdById: adminId,
          note: input.note ?? null,
        },
        aggregateId: orderId,
      });
    });

    return {
      componentId,
      orderGroupId: input.orderGroupId,
      amountCents: input.amountCents,
      remainingCents: remainingCents - input.amountCents,
      status: "requested" as const,
    };
  }
}
