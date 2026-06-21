import { Injectable, Logger } from "@nestjs/common";
import type { FulfillmentType, OrderStatus } from "@prisma/client";
import { etaMinutes, haversineKm } from "../common/geo";
import { PrismaService } from "../prisma/prisma.service";
import { PickingGateway } from "./picking.gateway";

// Ordem das etapas do pedido — usada p/ derivar o status agregado do Order a
// partir dos seus grupos (o pedido fica na etapa menos avançada entre as lojas).
const ORDER_STAGE: OrderStatus[] = [
  "created",
  "paid",
  "preparing",
  "picking",
  "ready_for_pickup",
  "on_the_way",
  "delivered",
];

/**
 * Rastreio do pedido por etapas (S5.1). Constrói um snapshot agregado do Order
 * (status geral + por loja/grupo + entrega própria) e o emite no canal Socket.IO
 * order:<orderId> a cada transição. Sem mapa/geolocalização (rastreio por status).
 */
/** Progresso da separação item a item (tela "Comprando" do cliente). */
export interface PickingProgress {
  total: number;
  /** Substituições aguardando decisão do cliente ("a escolher"). */
  toApprove: number;
  /** Separados ("selecionados"), inclui substituídos aprovados. */
  picked: number;
  /** Recusados/sem estoque ("reembolsados"). */
  refused: number;
  /** Ainda não resolvidos pelo separador ("a selecionar"). */
  pending: number;
}

export interface OrderTrackingGroup {
  orderGroupId: string;
  storeId: string;
  storeName: string;
  merchantId: string;
  merchantName: string;
  merchantLogoUrl: string | null;
  fulfillment: FulfillmentType;
  status: OrderStatus;
  subtotalCents: number;
  picking: PickingProgress | null;
  delivery: { status: string; driverName: string | null } | null;
}

export interface OrderTracking {
  orderId: string;
  status: OrderStatus;
  /** Código que o cliente apresenta na entrega/retirada. */
  deliveryCode: string | null;
  /** Há ao menos um grupo de retirada na loja. */
  hasPickup: boolean;
  /** Há ao menos um grupo de entrega própria. */
  hasDelivery: boolean;
  /** Janela prevista de entrega/retirada (agendada ou estimada). */
  etaWindow: { from: string; to: string } | null;
  /** Endereço de entrega (snapshot do checkout). */
  address: { street: string; number: string; city: string | null } | null;
  totalCents: number;
  groups: OrderTrackingGroup[];
  updatedAt: string;
}

/** Largura da janela exibida ao cliente (ETA real ± apresentação, S6.7). */
const ETA_WINDOW_MIN = 15;
/** Fallback quando não dá p/ calcular distância: criação +30/+60 min. */
const ETA_FROM_MIN = 30;
const ETA_TO_MIN = 60;

@Injectable()
export class OrderTrackingService {
  private readonly logger = new Logger(OrderTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PickingGateway,
  ) {}

  /**
   * Status do Order = etapa menos avançada entre seus grupos (ignora cancelados).
   * Recalcula e persiste o Order.status, depois emite o snapshot de rastreio.
   * Ponto compartilhado pelo módulo picking (HandoffService + PickingSessionService)
   * — não duplicar a regra de agregação. Idempotente.
   */
  async recomputeAndEmit(orderGroupId: string): Promise<void> {
    const group = await this.prisma.orderGroup.findUniqueOrThrow({
      where: { id: orderGroupId },
      select: { orderId: true },
    });
    const groups = await this.prisma.orderGroup.findMany({
      where: { orderId: group.orderId },
      select: { status: true },
    });
    // ignora grupos cancelados ao agregar
    const ranks = groups
      .map((g) => ORDER_STAGE.indexOf(g.status))
      .filter((r) => r >= 0);
    if (ranks.length === 0) return;
    const status = ORDER_STAGE[Math.min(...ranks)] ?? "preparing";
    await this.prisma.order.update({ where: { id: group.orderId }, data: { status } });
    // rastreio em tempo real (S5.1): emite o snapshot atualizado ao dono do pedido
    await this.emit(group.orderId);
  }

  /**
   * Emite o snapshot atualizado do pedido a partir do orderGroupId. Best-effort:
   * uma falha no build/emit não derruba a operação de separação que o chamou
   * (mesmo padrão do refund). Usado nas mudanças de item da separação.
   */
  async emitForGroup(orderGroupId: string): Promise<void> {
    try {
      const group = await this.prisma.orderGroup.findUniqueOrThrow({
        where: { id: orderGroupId },
        select: { orderId: true },
      });
      await this.emit(group.orderId);
    } catch (e) {
      this.logger.error(`Emit de rastreio do grupo ${orderGroupId} falhou: ${String(e)}`);
    }
  }

  /** Monta o snapshot de rastreio do pedido (usado no REST e no socket). */
  async build(orderId: string): Promise<OrderTracking> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        deliveryCode: true,
        updatedAt: true,
        createdAt: true,
        scheduledFrom: true,
        scheduledTo: true,
        totalCents: true,
        addressSnapshot: true,
        groups: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            storeId: true,
            merchantId: true,
            status: true,
            fulfillment: true,
            subtotalCents: true,
            store: {
              select: { name: true, latitude: true, longitude: true, avgPrepMinutes: true },
            },
            merchant: { select: { name: true, logoUrl: true } },
            delivery: {
              select: { status: true, driver: { select: { name: true } } },
            },
            pickTask: {
              select: {
                items: {
                  select: {
                    status: true,
                    substitution: { select: { approvalStatus: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const groups: OrderTrackingGroup[] = order.groups.map((g) => ({
      orderGroupId: g.id,
      storeId: g.storeId,
      storeName: g.store.name,
      merchantId: g.merchantId,
      merchantName: g.merchant.name,
      merchantLogoUrl: g.merchant.logoUrl,
      fulfillment: g.fulfillment,
      status: g.status,
      subtotalCents: g.subtotalCents,
      picking: g.pickTask ? pickingProgress(g.pickTask.items) : null,
      delivery: g.delivery
        ? { status: g.delivery.status, driverName: g.delivery.driver?.name ?? null }
        : null,
    }));

    const snap = order.addressSnapshot as {
      street?: string;
      number?: string;
      city?: string;
      latitude?: number | null;
      longitude?: number | null;
    } | null;

    // Janela: agendamento do checkout > ETA real (preparo + deslocamento, S6.7) > fallback fixo.
    let etaWindow: { from: string; to: string };
    if (order.scheduledFrom && order.scheduledTo) {
      etaWindow = { from: order.scheduledFrom.toISOString(), to: order.scheduledTo.toISOString() };
    } else {
      const etas = order.groups
        .map((g) => {
          const st = g.store;
          if (snap?.latitude == null || snap.longitude == null) return null;
          if (st.latitude == null || st.longitude == null) return null;
          const dist = haversineKm(snap.latitude, snap.longitude, st.latitude, st.longitude);
          return etaMinutes(st.avgPrepMinutes, dist);
        })
        .filter((e): e is number => e != null);
      if (etas.length > 0) {
        // pedido multi-loja chega no ritmo da loja mais demorada
        const eta = Math.max(...etas);
        etaWindow = {
          from: new Date(order.createdAt.getTime() + eta * 60_000).toISOString(),
          to: new Date(order.createdAt.getTime() + (eta + ETA_WINDOW_MIN) * 60_000).toISOString(),
        };
      } else {
        etaWindow = {
          from: new Date(order.createdAt.getTime() + ETA_FROM_MIN * 60_000).toISOString(),
          to: new Date(order.createdAt.getTime() + ETA_TO_MIN * 60_000).toISOString(),
        };
      }
    }

    return {
      orderId: order.id,
      status: order.status,
      deliveryCode: order.deliveryCode,
      hasPickup: groups.some((g) => g.fulfillment === "pickup"),
      hasDelivery: groups.some((g) => g.fulfillment === "delivery"),
      etaWindow,
      address:
        snap?.street != null
          ? { street: snap.street, number: snap.number ?? "", city: snap.city ?? null }
          : null,
      totalCents: order.totalCents,
      groups,
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  /** Emite o snapshot atualizado no canal do pedido. Best-effort. */
  async emit(orderId: string): Promise<void> {
    const tracking = await this.build(orderId);
    this.gateway.emitToOrder(orderId, "order.updated", { ...tracking });
  }
}

/** Conta itens da separação por estado, na visão do cliente. */
function pickingProgress(
  items: { status: string; substitution: { approvalStatus: string } | null }[],
): PickingProgress {
  const p: PickingProgress = { total: items.length, toApprove: 0, picked: 0, refused: 0, pending: 0 };
  for (const it of items) {
    if (it.substitution?.approvalStatus === "pending") p.toApprove += 1;
    else if (it.status === "picked" || it.status === "substituted") p.picked += 1;
    else if (it.status === "refused") p.refused += 1;
    else p.pending += 1;
  }
  return p;
}
