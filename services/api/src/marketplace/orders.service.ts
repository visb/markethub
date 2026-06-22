import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { DeliveryMethod, FulfillmentType } from "@prisma/client";
import { shortCode } from "../common/codes";
import { ErpService } from "../erp/erp.service";
import { IntegrationService } from "../integration/integration.service";
import { RefundService } from "../payment/refund.service";
import { OrderEvents } from "../picking/order.events";
import { OrderTrackingService } from "../picking/order-tracking.service";
import { PickingService } from "../picking/picking.service";
import { PrismaService } from "../prisma/prisma.service";
import { SchedulingService } from "../scheduling/scheduling.service";
import { CartService } from "./cart.service";

export interface CreateOrderInput {
  /** Entrega: obrigatório. Retirada na loja: ignorado. */
  addressId?: string | null;
  fulfillment: FulfillmentType;
  deliveryMethod?: DeliveryMethod;
  scheduledFrom?: string | null;
  scheduledTo?: string | null;
  /** Slot de capacidade escolhido no checkout (S5.3). Define scheduledFrom/To. */
  deliverySlotId?: string | null;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly erp: ErpService,
    private readonly picking: PickingService,
    private readonly tracking: OrderTrackingService,
    private readonly scheduling: SchedulingService,
    private readonly refund: RefundService,
    private readonly integration: IntegrationService,
    private readonly orderEvents: OrderEvents,
  ) {}

  /** Snapshot de rastreio do pedido por etapas (S5.1). Só o dono acessa. */
  async getTracking(userId: string, id: string) {
    await this.detail(userId, id); // valida posse (lança se não for dono)
    return this.tracking.build(id);
  }

  /** Calcula o total final sem criar pedido (preview do checkout). */
  async preview(userId: string, input: CreateOrderInput) {
    const pickup = input.fulfillment === "pickup";
    if (!pickup) await this.assertAddress(userId, input.addressId);
    const doorSurchargeCents =
      !pickup && input.deliveryMethod === "door" ? CartService.DOOR_SURCHARGE_CENTS : 0;
    const view = await this.cart.getCart(userId, { doorSurchargeCents, fulfillment: input.fulfillment });
    if (view.itemCount === 0) {
      throw new BadRequestException({ code: "CART_EMPTY", message: "Carrinho vazio" });
    }
    return { ...view, deliveryMethod: input.deliveryMethod, fulfillment: input.fulfillment };
  }

  /** Cria o pedido (status created) a partir do carrinho. Limpa o carrinho. */
  async checkout(userId: string, input: CreateOrderInput) {
    const pickup = input.fulfillment === "pickup";
    const address = pickup ? null : await this.assertAddress(userId, input.addressId);
    const doorSurchargeCents =
      !pickup && input.deliveryMethod === "door" ? CartService.DOOR_SURCHARGE_CENTS : 0;
    const view = await this.cart.getCart(userId, { doorSurchargeCents, fulfillment: input.fulfillment });
    if (view.itemCount === 0) {
      throw new BadRequestException({ code: "CART_EMPTY", message: "Carrinho vazio" });
    }
    if (view.groups.some((g) => g.items.some((i) => !i.available))) {
      throw new BadRequestException({ code: "ITEM_UNAVAILABLE", message: "Item indisponível no carrinho" });
    }

    const totalsByMerchant = new Map(view.totals.groups.map((g) => [g.merchantId, g]));
    const storeIds = view.groups.map((g) => g.storeId);

    const order = await this.prisma.$transaction(async (tx) => {
      // reserva o slot (S5.3) atomicamente; a janela do slot define scheduledFrom/To
      let scheduledFrom = input.scheduledFrom ? new Date(input.scheduledFrom) : null;
      let scheduledTo = input.scheduledTo ? new Date(input.scheduledTo) : null;
      if (input.deliverySlotId) {
        const window = await this.scheduling.reserveInTx(tx, input.deliverySlotId, storeIds);
        scheduledFrom = window.start;
        scheduledTo = window.end;
      }

      const created = await tx.order.create({
        data: {
          userId,
          status: "created",
          addressId: address?.id ?? null,
          deliveryMethod: input.deliveryMethod ?? "gate",
          deliverySlotId: input.deliverySlotId ?? null,
          scheduledFrom,
          scheduledTo,
          addressSnapshot: address ? (address as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          itemsCents: view.totals.itemsCents,
          deliveryCents: view.totals.deliveryCents + view.totals.doorSurchargeCents,
          prepCents: view.totals.prepCents,
          platformFeeCents: view.totals.platformFeeCents,
          discountCents: view.totals.discountCents,
          totalCents: view.totals.totalCents,
          couponCode: view.couponCode,
          // código de entrega exibido ao cliente; entregador digita p/ confirmar (SF.1)
          deliveryCode: shortCode(),
        },
      });

      for (const g of view.groups) {
        const t = totalsByMerchant.get(g.merchantId)!;
        await tx.orderGroup.create({
          data: {
            orderId: created.id,
            merchantId: g.merchantId,
            storeId: g.storeId,
            status: "created",
            fulfillment: input.fulfillment,
            subtotalCents: t.subtotalCents,
            deliveryCents: t.deliveryCents,
            prepCents: t.prepCents,
            platformFeeCents: t.platformFeeCents,
            items: {
              create: g.items.map((i) => ({
                productId: i.productId,
                offerId: i.offerId,
                nameSnapshot: i.name,
                gtinSnapshot: i.gtin,
                saleType: i.saleType,
                unitPriceCents: i.unitPriceCents,
                quantity: i.quantity,
                weightGrams: i.weightGrams,
                lineTotalCents:
                  i.saleType === "weight"
                    ? Math.round((i.unitPriceCents * (i.weightGrams ?? 0)) / 1000)
                    : i.unitPriceCents * i.quantity,
              })),
            },
          },
        });
      }
      return created;
    });

    await this.cart.clear(userId);

    // Webhook order.created (story 09) + socket à store room (story 12), por
    // merchant da rede que recebeu grupo.
    for (const g of view.groups) {
      void this.integration.emit(g.merchantId, "order.created", {
        orderId: order.id,
        merchantId: g.merchantId,
        storeId: g.storeId,
        status: "created",
      });
      this.orderEvents.created({
        orderId: order.id,
        merchantId: g.merchantId,
        storeId: g.storeId,
        status: "created",
      });
    }

    return this.detail(userId, order.id);
  }

  list(userId: string, opts: { page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
    return this.prisma.order
      .findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          totalCents: true,
          createdAt: true,
          deliveryMethod: true,
          deliveryCode: true,
          scheduledFrom: true,
          scheduledTo: true,
          addressSnapshot: true,
          groups: { select: { fulfillment: true } },
          _count: { select: { groups: true } },
          payment: { select: { status: true } },
          refund: { select: { amountCents: true, status: true } },
        },
      })
      .then((items) => ({ items, page, pageSize }));
  }

  async detail(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        groups: {
          include: {
            merchant: { select: { name: true } },
            store: { select: { name: true } },
            items: true,
          },
        },
        payment: true,
        address: true,
        refund: { include: { components: true } },
      },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado" });
    }
    return order;
  }

  /** Pagamento confirmado → preparing + push ao ERP de cada grupo. Idempotente. */
  async markPaid(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { groups: true },
    });
    if (!order) return;
    if (order.status !== "created" && order.status !== "paid") return; // idempotente

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: "preparing" },
    });
    await this.prisma.orderGroup.updateMany({
      where: { orderId },
      data: { status: "preparing" },
    });
    for (const g of order.groups) await this.erp.pushOrderGroup(g.id);

    // gera tarefas de separação (queued) p/ os separadores assumirem (S3.2)
    await this.picking.generateForOrder(orderId);
    // rastreio em tempo real (S5.1): pago → preparando
    await this.tracking.emit(orderId);
    // webhook order.status_changed → preparing (story 09) + socket (story 12)
    for (const g of order.groups) {
      void this.integration.emit(g.merchantId, "order.status_changed", {
        orderId,
        merchantId: g.merchantId,
        storeId: g.storeId,
        status: "preparing",
      });
      this.orderEvents.statusChanged({
        orderId,
        merchantId: g.merchantId,
        storeId: g.storeId,
        status: "preparing",
      });
    }
  }

  /**
   * Cancela o pedido. Permitido antes da separação começar:
   * - created (não pago): só cancela;
   * - paid/preparing com todas as separações ainda não iniciadas: cancela,
   *   remove as tarefas da fila e emite estorno integral.
   */
  async cancel(userId: string, id: string) {
    const order = await this.detail(userId, id);
    const cancelable = order.status === "created" || order.status === "paid" || order.status === "preparing";
    if (!cancelable) {
      throw new BadRequestException({
        code: "CANNOT_CANCEL",
        message: "Só é possível cancelar antes da separação começar",
      });
    }
    const tasks = await this.prisma.pickTask.findMany({
      where: { orderGroup: { orderId: id } },
      select: { id: true, status: true },
    });
    if (tasks.some((t) => t.status !== "queued" && t.status !== "assigned")) {
      throw new BadRequestException({
        code: "CANNOT_CANCEL",
        message: "Separação já começou — não é mais possível cancelar",
      });
    }

    const canceled = await this.prisma.$transaction(async (tx) => {
      if (tasks.length > 0) {
        await tx.pickTask.deleteMany({ where: { id: { in: tasks.map((t) => t.id) } } });
      }
      await tx.orderGroup.updateMany({ where: { orderId: id }, data: { status: "canceled" } });
      return tx.order.update({ where: { id }, data: { status: "canceled" } });
    });

    // libera a vaga do slot reservado (S5.3)
    if (order.deliverySlotId) await this.scheduling.release(order.deliverySlotId);
    // estorno integral se já pago
    await this.refund.issueCancelRefund(id);
    // rastreio em tempo real
    await this.tracking.emit(id);
    // webhook order.status_changed → canceled (story 09) + socket (story 12)
    for (const g of order.groups) {
      void this.integration.emit(g.merchantId, "order.status_changed", {
        orderId: id,
        merchantId: g.merchantId,
        storeId: g.storeId,
        status: "canceled",
      });
      this.orderEvents.statusChanged({
        orderId: id,
        merchantId: g.merchantId,
        storeId: g.storeId,
        status: "canceled",
      });
    }
    return canceled;
  }

  private async assertAddress(userId: string, addressId?: string | null) {
    if (!addressId) {
      throw new BadRequestException({ code: "ADDRESS_REQUIRED", message: "Endereço é obrigatório para entrega" });
    }
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) {
      throw new BadRequestException({ code: "ADDRESS_NOT_FOUND", message: "Endereço inválido" });
    }
    return address;
  }
}
