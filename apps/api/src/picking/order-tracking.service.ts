import { Injectable } from "@nestjs/common";
import type { FulfillmentType, OrderStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PickingGateway } from "./picking.gateway";

/**
 * Rastreio do pedido por etapas (S5.1). Constrói um snapshot agregado do Order
 * (status geral + por loja/grupo + entrega própria) e o emite no canal Socket.IO
 * order:<orderId> a cada transição. Sem mapa/geolocalização (rastreio por status).
 */
export interface OrderTrackingGroup {
  orderGroupId: string;
  storeId: string;
  storeName: string;
  fulfillment: FulfillmentType;
  status: OrderStatus;
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
  groups: OrderTrackingGroup[];
  updatedAt: string;
}

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
        groups: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            storeId: true,
            status: true,
            fulfillment: true,
            store: { select: { name: true } },
            delivery: {
              select: { status: true, driver: { select: { name: true } } },
            },
          },
        },
      },
    });

    const groups: OrderTrackingGroup[] = order.groups.map((g) => ({
      orderGroupId: g.id,
      storeId: g.storeId,
      storeName: g.store.name,
      fulfillment: g.fulfillment,
      status: g.status,
      delivery: g.delivery
        ? { status: g.delivery.status, driverName: g.delivery.driver?.name ?? null }
        : null,
    }));

    return {
      orderId: order.id,
      status: order.status,
      deliveryCode: order.deliveryCode,
      hasPickup: groups.some((g) => g.fulfillment === "pickup"),
      hasDelivery: groups.some((g) => g.fulfillment === "delivery"),
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
