import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { DeliveryMethod, Prisma } from "@prisma/client";
import { ErpService } from "../erp/erp.service";
import { PrismaService } from "../prisma/prisma.service";
import { CartService } from "./cart.service";

export interface CreateOrderInput {
  addressId: string;
  deliveryMethod: DeliveryMethod;
  scheduledFrom?: string | null;
  scheduledTo?: string | null;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly erp: ErpService,
  ) {}

  /** Calcula o total final sem criar pedido (preview do checkout). */
  async preview(userId: string, input: CreateOrderInput) {
    await this.assertAddress(userId, input.addressId);
    const doorSurchargeCents =
      input.deliveryMethod === "door" ? CartService.DOOR_SURCHARGE_CENTS : 0;
    const view = await this.cart.getCart(userId, { doorSurchargeCents });
    if (view.itemCount === 0) {
      throw new BadRequestException({ code: "CART_EMPTY", message: "Carrinho vazio" });
    }
    return { ...view, deliveryMethod: input.deliveryMethod };
  }

  /** Cria o pedido (status created) a partir do carrinho. Limpa o carrinho. */
  async checkout(userId: string, input: CreateOrderInput) {
    const address = await this.assertAddress(userId, input.addressId);
    const doorSurchargeCents =
      input.deliveryMethod === "door" ? CartService.DOOR_SURCHARGE_CENTS : 0;
    const view = await this.cart.getCart(userId, { doorSurchargeCents });
    if (view.itemCount === 0) {
      throw new BadRequestException({ code: "CART_EMPTY", message: "Carrinho vazio" });
    }
    if (view.groups.some((g) => g.items.some((i) => !i.available))) {
      throw new BadRequestException({ code: "ITEM_UNAVAILABLE", message: "Item indisponível no carrinho" });
    }

    const totalsByMerchant = new Map(view.totals.groups.map((g) => [g.merchantId, g]));

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId,
          status: "created",
          addressId: address.id,
          deliveryMethod: input.deliveryMethod,
          scheduledFrom: input.scheduledFrom ? new Date(input.scheduledFrom) : null,
          scheduledTo: input.scheduledTo ? new Date(input.scheduledTo) : null,
          addressSnapshot: address as unknown as Prisma.InputJsonValue,
          itemsCents: view.totals.itemsCents,
          deliveryCents: view.totals.deliveryCents + view.totals.doorSurchargeCents,
          prepCents: view.totals.prepCents,
          platformFeeCents: view.totals.platformFeeCents,
          discountCents: view.totals.discountCents,
          totalCents: view.totals.totalCents,
          couponCode: view.couponCode,
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
          addressSnapshot: true,
          _count: { select: { groups: true } },
          payment: { select: { status: true } },
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
  }

  async cancel(userId: string, id: string) {
    const order = await this.detail(userId, id);
    if (order.status !== "created") {
      throw new BadRequestException({
        code: "CANNOT_CANCEL",
        message: "Só é possível cancelar antes do preparo",
      });
    }
    return this.prisma.order.update({ where: { id }, data: { status: "canceled" } });
  }

  private async assertAddress(userId: string, addressId: string) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.userId !== userId) {
      throw new BadRequestException({ code: "ADDRESS_NOT_FOUND", message: "Endereço inválido" });
    }
    return address;
  }
}
