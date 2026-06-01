import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ROUTE_INCLUDE, toRouteDto } from "./delivery.mapper";

/**
 * Execução da rota (S4.5/S4.6): chegada nas paradas, fechamento da coleta
 * (após a loja liberar por pickupCode) e confirmação da entrega por deliveryCode.
 */
@Injectable()
export class RouteExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Chega na parada: pending → arrived. Primeira chegada move a rota p/ in_progress. */
  async arrive(userId: string, routeId: string, stopId: string) {
    const stop = await this.ownedStop(userId, routeId, stopId);
    if (stop.status === "pending") {
      await this.prisma.routeStop.update({
        where: { id: stopId },
        data: { status: "arrived", arrivedAt: new Date() },
      });
    }
    await this.prisma.deliveryRoute.updateMany({
      where: { id: routeId, status: "accepted" },
      data: { status: "in_progress" },
    });
    return this.detail(routeId);
  }

  /**
   * Fecha a parada de coleta (arrived → done). Exige que a loja já tenha liberado
   * todos os OrderGroups (status on_the_way, via pickupCode em release-pickup).
   */
  async leavePickup(userId: string, routeId: string, stopId: string) {
    const stop = await this.ownedStop(userId, routeId, stopId);
    if (stop.type !== "pickup") {
      throw new BadRequestException({ code: "NOT_PICKUP_STOP", message: "Parada não é de coleta" });
    }
    if (stop.status === "done") return this.detail(routeId); // idempotente
    if (stop.status !== "arrived") {
      throw new BadRequestException({ code: "STOP_NOT_ARRIVED", message: "Chegue à loja antes de sair" });
    }
    const groups = await this.prisma.orderGroup.findMany({
      where: { pickupStopId: stopId },
      select: { status: true },
    });
    if (groups.length === 0 || !groups.every((g) => g.status === "on_the_way")) {
      throw new BadRequestException({
        code: "PICKUP_NOT_RELEASED",
        message: "A loja ainda não liberou todos os pedidos (pickupCode)",
      });
    }
    await this.prisma.routeStop.update({
      where: { id: stopId },
      data: { status: "done", doneAt: new Date() },
    });
    return this.detail(routeId);
  }

  /**
   * Confirma a entrega validando o deliveryCode (informado pelo cliente). Marca
   * os OrderGroups do pedido como delivered e, com todos entregues, Order →
   * delivered. Não fecha a parada (isso é o complete). Idempotente.
   */
  async confirmDropoff(userId: string, routeId: string, stopId: string, deliveryCode: string) {
    const stop = await this.ownedStop(userId, routeId, stopId);
    if (stop.type !== "dropoff" || !stop.orderId) {
      throw new BadRequestException({ code: "NOT_DROPOFF_STOP", message: "Parada não é de entrega" });
    }
    if (stop.status !== "arrived" && stop.status !== "done") {
      throw new BadRequestException({ code: "STOP_NOT_ARRIVED", message: "Chegue ao cliente antes de confirmar" });
    }
    const order = await this.prisma.order.findUnique({
      where: { id: stop.orderId },
      select: { id: true, status: true, deliveryCode: true },
    });
    if (!order) throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado" });
    if (order.status === "delivered") return this.detail(routeId); // idempotente
    if (!order.deliveryCode || deliveryCode.trim() !== order.deliveryCode) {
      throw new BadRequestException({ code: "INVALID_DELIVERY_CODE", message: "Código de entrega inválido" });
    }

    await this.prisma.orderGroup.updateMany({
      where: { orderId: order.id, status: "on_the_way" },
      data: { status: "delivered" },
    });
    // Order entregue quando todos os grupos (não cancelados) estão delivered.
    const groups = await this.prisma.orderGroup.findMany({
      where: { orderId: order.id, status: { not: "canceled" } },
      select: { status: true },
    });
    if (groups.length > 0 && groups.every((g) => g.status === "delivered")) {
      await this.prisma.order.update({ where: { id: order.id }, data: { status: "delivered" } });
    }
    return this.detail(routeId);
  }

  /**
   * "Finalizar Entrega": fecha a parada de entrega (exige entrega confirmada).
   * Concluída a última parada da rota → DeliveryRoute completed + entregador
   * volta a available (gatilho dos ganhos, S4.7).
   */
  async completeDropoff(userId: string, routeId: string, stopId: string) {
    const stop = await this.ownedStop(userId, routeId, stopId);
    if (stop.type !== "dropoff" || !stop.orderId) {
      throw new BadRequestException({ code: "NOT_DROPOFF_STOP", message: "Parada não é de entrega" });
    }
    if (stop.status === "done") return this.detail(routeId); // idempotente
    const order = await this.prisma.order.findUnique({
      where: { id: stop.orderId },
      select: { status: true },
    });
    if (order?.status !== "delivered") {
      throw new BadRequestException({
        code: "DELIVERY_NOT_CONFIRMED",
        message: "Confirme a entrega (deliveryCode) antes de finalizar",
      });
    }
    await this.prisma.routeStop.update({
      where: { id: stopId },
      data: { status: "done", doneAt: new Date() },
    });
    await this.completeRouteIfDone(userId, routeId);
    return this.detail(routeId);
  }

  /** Se todas as paradas estão done, conclui a rota e libera o entregador. */
  private async completeRouteIfDone(userId: string, routeId: string) {
    const pending = await this.prisma.routeStop.count({
      where: { routeId, status: { not: "done" } },
    });
    if (pending > 0) return;
    const { count } = await this.prisma.deliveryRoute.updateMany({
      where: { id: routeId, status: { in: ["accepted", "in_progress"] } },
      data: { status: "completed", completedAt: new Date() },
    });
    if (count > 0) {
      await this.prisma.driverProfile.update({
        where: { userId },
        data: { status: "available", lastSeenAt: new Date() },
      });
    }
  }

  /** Garante que a parada pertence a uma rota ativa do entregador. */
  protected async ownedStop(userId: string, routeId: string, stopId: string) {
    const route = await this.prisma.deliveryRoute.findUnique({ where: { id: routeId } });
    if (!route) throw new NotFoundException({ code: "ROUTE_NOT_FOUND", message: "Rota não encontrada" });
    if (route.driverId !== userId) {
      throw new ForbiddenException({ code: "NOT_ROUTE_DRIVER", message: "Rota não é sua" });
    }
    if (route.status !== "accepted" && route.status !== "in_progress") {
      throw new BadRequestException({ code: "ROUTE_NOT_ACTIVE", message: "Rota não está ativa" });
    }
    const stop = await this.prisma.routeStop.findFirst({ where: { id: stopId, routeId } });
    if (!stop) throw new NotFoundException({ code: "STOP_NOT_FOUND", message: "Parada não encontrada" });
    return stop;
  }

  protected async detail(routeId: string) {
    const route = await this.prisma.deliveryRoute.findUniqueOrThrow({
      where: { id: routeId },
      include: ROUTE_INCLUDE,
    });
    return toRouteDto(route);
  }
}
