import { Injectable } from "@nestjs/common";
import type { FulfillmentType, OrderStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PickingGateway } from "./picking.gateway";

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

/** Janela estimada quando não há agendamento: criação +30/+60 min. */
const ETA_FROM_MIN = 30;
const ETA_TO_MIN = 60;

@Injectable()
export class OrderTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PickingGateway,
  ) {}

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
            store: { select: { name: true } },
            merchant: { select: { name: true } },
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
      fulfillment: g.fulfillment,
      status: g.status,
      subtotalCents: g.subtotalCents,
      picking: g.pickTask ? pickingProgress(g.pickTask.items) : null,
      delivery: g.delivery
        ? { status: g.delivery.status, driverName: g.delivery.driver?.name ?? null }
        : null,
    }));

    // Janela: agendamento do checkout, ou estimativa a partir da criação.
    const etaWindow =
      order.scheduledFrom && order.scheduledTo
        ? { from: order.scheduledFrom.toISOString(), to: order.scheduledTo.toISOString() }
        : {
            from: new Date(order.createdAt.getTime() + ETA_FROM_MIN * 60_000).toISOString(),
            to: new Date(order.createdAt.getTime() + ETA_TO_MIN * 60_000).toISOString(),
          };

    const snap = order.addressSnapshot as {
      street?: string;
      number?: string;
      city?: string;
    } | null;

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
