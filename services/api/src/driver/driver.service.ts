import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { DeliveryStatus } from "@prisma/client";
import { HandoffService } from "../picking/handoff.service";
import { PrismaService } from "../prisma/prisma.service";
import { DELIVERY_INCLUDE, toDeliveryDto } from "./delivery.mapper";

/**
 * Entrega própria — lado do entregador. O entregador é vinculado a uma loja
 * (StoreStaff role driver) e só vê as entregas que a loja lhe atribuiu.
 * Coleta: valida o pickupCode (reusa HandoffService). Entrega: valida o
 * deliveryCode do cliente. Sem disponibilidade/geolocalização/ganhos.
 */
@Injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly handoff: HandoffService,
  ) {}

  /** Lojas em que o usuário atua como entregador (para o app escolher a fila). */
  async myStores(userId: string) {
    const staff = await this.prisma.storeStaff.findMany({
      where: { userId, staffRole: "driver", active: true },
      include: { store: { select: { id: true, name: true, merchantId: true } } },
    });
    return staff.map((s) => s.store);
  }

  /** Entregas atribuídas ao entregador (em aberto por padrão). */
  async listAssigned(userId: string, opts: { storeId?: string; status?: string } = {}) {
    const status = opts.status
      ? ([opts.status] as DeliveryStatus[])
      : (["assigned", "picked_up"] as DeliveryStatus[]);
    const deliveries = await this.prisma.delivery.findMany({
      where: {
        driverId: userId,
        status: { in: status },
        ...(opts.storeId ? { storeId: opts.storeId } : {}),
      },
      orderBy: { assignedAt: "asc" },
      include: DELIVERY_INCLUDE,
    });
    return deliveries.map(toDeliveryDto);
  }

  /**
   * Coleta na loja: valida o pickupCode → OrderGroup on_the_way (via HandoffService)
   * e Delivery → picked_up. Idempotente.
   */
  async confirmPickup(userId: string, deliveryId: string, pickupCode: string) {
    const delivery = await this.ownedDelivery(userId, deliveryId);
    if (delivery.status === "picked_up") return this.detail(deliveryId); // idempotente
    if (delivery.status !== "assigned") {
      throw new BadRequestException({
        code: "DELIVERY_NOT_ASSIGNED",
        message: "Entrega não está atribuída a você",
      });
    }
    const group = await this.prisma.orderGroup.findUniqueOrThrow({
      where: { id: delivery.orderGroupId },
      select: { pickTask: { select: { id: true } } },
    });
    if (!group.pickTask) {
      throw new BadRequestException({ code: "PICK_TASK_NOT_FOUND", message: "Separação não encontrada" });
    }
    // valida o código e avança OrderGroup ready_for_pickup → on_the_way
    await this.handoff.confirmPickup(group.pickTask.id, pickupCode);
    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: "picked_up", pickedUpAt: new Date() },
    });
    return this.detail(deliveryId);
  }

  /**
   * Entrega ao cliente: valida o deliveryCode → OrderGroup delivered (via
   * HandoffService) e Delivery → delivered. Idempotente.
   */
  async confirmDelivery(userId: string, deliveryId: string, deliveryCode: string) {
    const delivery = await this.ownedDelivery(userId, deliveryId);
    if (delivery.status === "delivered") return this.detail(deliveryId); // idempotente
    if (delivery.status !== "picked_up") {
      throw new BadRequestException({
        code: "DELIVERY_NOT_PICKED_UP",
        message: "Faça a coleta antes de entregar",
      });
    }
    await this.handoff.confirmDelivered(delivery.orderGroupId, deliveryCode);
    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: "delivered", deliveredAt: new Date() },
    });
    return this.detail(deliveryId);
  }

  /** Garante que a entrega pertence ao entregador. */
  private async ownedDelivery(userId: string, deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new NotFoundException({ code: "DELIVERY_NOT_FOUND", message: "Entrega não encontrada" });
    }
    if (delivery.driverId !== userId) {
      throw new ForbiddenException({ code: "NOT_DELIVERY_DRIVER", message: "Entrega não é sua" });
    }
    return delivery;
  }

  private async detail(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUniqueOrThrow({
      where: { id: deliveryId },
      include: DELIVERY_INCLUDE,
    });
    return toDeliveryDto(delivery);
  }
}
