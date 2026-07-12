import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { DeliveryStatus } from "@prisma/client";
import { PushService } from "../notifications";
import { HandoffService } from "../picking/handoff.service";
import { OrderTrackingService } from "../picking/order-tracking.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertDriverAvailable, toAvailabilityView } from "./driver-availability.service";
import { DELIVERY_INCLUDE, toDeliveryDto } from "./delivery.mapper";

/**
 * Entrega própria — lado da loja (manager/picker). Fila de entregas da loja,
 * atribuição manual a um entregador vinculado e confirmação de retirada (pickup).
 */
@Injectable()
export class StoreDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly handoff: HandoffService,
    private readonly tracking: OrderTrackingService,
    private readonly push: PushService,
  ) {}

  /** Fila de entregas da loja (por padrão as ainda não entregues). */
  async queue(userId: string, storeId: string, status?: string) {
    await this.assertStoreStaff(userId, storeId);
    const where = status
      ? { storeId, status: status as DeliveryStatus }
      : { storeId, status: { in: ["unassigned", "assigned", "picked_up", "failed"] as DeliveryStatus[] } };
    const deliveries = await this.prisma.delivery.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: DELIVERY_INCLUDE,
    });
    return deliveries.map(toDeliveryDto);
  }

  /** Entregadores vinculados à loja (com carga atual de entregas em aberto). */
  async drivers(userId: string, storeId: string) {
    await this.assertStoreStaff(userId, storeId);
    const staff = await this.prisma.storeStaff.findMany({
      where: { storeId, staffRole: "driver", active: true },
      include: { user: { select: { id: true, name: true, driverAvailableAt: true } } },
    });
    const loads = await this.prisma.delivery.groupBy({
      by: ["driverId"],
      where: { storeId, status: { in: ["assigned", "picked_up"] } },
      _count: { _all: true },
    });
    const loadByDriver = new Map(loads.map((l) => [l.driverId, l._count._all]));
    return staff.map((s) => {
      // Turno on/off (story 62): a lista mostra todos com badge disponível/indisponível.
      const availability = toAvailabilityView(s.user.driverAvailableAt);
      return {
        id: s.user.id,
        name: s.user.name,
        activeDeliveries: loadByDriver.get(s.user.id) ?? 0,
        available: availability.available,
        availableSince: availability.availableSince,
      };
    });
  }

  /** Atribui um entregador da loja à entrega (lock otimista em unassigned). */
  async assign(userId: string, deliveryId: string, driverId: string) {
    const delivery = await this.loadDelivery(deliveryId);
    await this.assertStoreStaff(userId, delivery.storeId);
    const isDriver = await this.prisma.storeStaff.findFirst({
      where: { userId: driverId, storeId: delivery.storeId, staffRole: "driver", active: true },
    });
    if (!isDriver) {
      throw new BadRequestException({
        code: "NOT_STORE_DRIVER",
        message: "Usuário não é entregador desta loja",
      });
    }
    // Turno on/off (story 62): não atribui a entregador fora de turno (indisponível).
    await assertDriverAvailable(this.prisma, driverId);
    const { count } = await this.prisma.delivery.updateMany({
      where: { id: deliveryId, status: "unassigned" },
      data: { status: "assigned", driverId, assignedAt: new Date() },
    });
    if (count === 0) {
      throw new BadRequestException({
        code: "DELIVERY_NOT_UNASSIGNED",
        message: "Entrega já foi atribuída",
      });
    }
    await this.emitTracking(delivery.orderGroupId);
    await this.push.sendToUser(driverId, {
      title: "Nova entrega",
      body: "Uma entrega foi atribuída a você.",
      data: { deliveryId, route: `/delivery/${deliveryId}` },
    });
    return this.detail(deliveryId);
  }

  /** Desfaz a atribuição (assigned → unassigned). Só antes da coleta. */
  async unassign(userId: string, deliveryId: string) {
    const delivery = await this.loadDelivery(deliveryId);
    await this.assertStoreStaff(userId, delivery.storeId);
    const { count } = await this.prisma.delivery.updateMany({
      where: { id: deliveryId, status: "assigned" },
      data: { status: "unassigned", driverId: null, assignedAt: null },
    });
    if (count === 0) {
      throw new BadRequestException({
        code: "DELIVERY_NOT_ASSIGNED",
        message: "Só é possível desatribuir entregas atribuídas (não coletadas)",
      });
    }
    await this.emitTracking(delivery.orderGroupId);
    return this.detail(deliveryId);
  }

  /**
   * Reenvia uma entrega com falha (story 61): a loja decide tentar de novo. Só
   * `failed → unassigned` — limpa o entregador e os timestamps de coleta, mas
   * PRESERVA a última falha (`failReason`/`failNote`/`failedAt`) para histórico/
   * contexto. Na MESMA TX devolve o OrderGroup a `ready_for_pickup` (ele estava
   * `on_the_way` desde a coleta) para que o fluxo de coleta funcione de novo: a
   * entrega volta ao pool e à fila de coleta. Estoque NÃO é mexido. Não-`failed`
   * → `DELIVERY_NOT_FAILED`.
   */
  async retry(userId: string, deliveryId: string) {
    const delivery = await this.loadDelivery(deliveryId);
    await this.assertStoreStaff(userId, delivery.storeId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.delivery.updateMany({
        where: { id: deliveryId, status: "failed" },
        data: { status: "unassigned", driverId: null, assignedAt: null, pickedUpAt: null },
      });
      if (count === 0) {
        throw new BadRequestException({
          code: "DELIVERY_NOT_FAILED",
          message: "Só é possível reenviar entregas com falha",
        });
      }
      await tx.orderGroup.update({
        where: { id: delivery.orderGroupId },
        data: { status: "ready_for_pickup" },
      });
    });
    await this.emitTracking(delivery.orderGroupId);
    return this.detail(deliveryId);
  }

  /** Emite o rastreio do pedido dono do grupo (S5.1). Best-effort. */
  private async emitTracking(orderGroupId: string) {
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: orderGroupId },
      select: { orderId: true },
    });
    if (group) await this.tracking.emit(group.orderId);
  }

  /**
   * Retirada na loja (pickup): o cliente apresenta o código e a loja confirma a
   * entrega. Só para grupos com fulfillment = pickup. Reusa o HandoffService.
   */
  async handover(userId: string, orderGroupId: string, code: string) {
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: orderGroupId },
      select: { id: true, storeId: true, fulfillment: true },
    });
    if (!group) {
      throw new NotFoundException({ code: "ORDER_GROUP_NOT_FOUND", message: "Pedido não encontrado" });
    }
    await this.assertStoreStaff(userId, group.storeId);
    if (group.fulfillment !== "pickup") {
      throw new BadRequestException({
        code: "NOT_PICKUP",
        message: "Este pedido não é de retirada na loja",
      });
    }
    await this.handoff.confirmDelivered(orderGroupId, code);
    return { delivered: true };
  }

  private async loadDelivery(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new NotFoundException({ code: "DELIVERY_NOT_FOUND", message: "Entrega não encontrada" });
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

  /** RBAC: usuário é manager ou picker ativo da loja (quem opera o despacho). */
  private async assertStoreStaff(userId: string, storeId: string) {
    const staff = await this.prisma.storeStaff.findFirst({
      where: { userId, storeId, staffRole: { in: ["manager", "picker"] }, active: true },
    });
    if (!staff) {
      throw new ForbiddenException({
        code: "NOT_STORE_STAFF",
        message: "Usuário não opera o despacho desta loja",
      });
    }
    return staff;
  }
}
