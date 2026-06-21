import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { shortCode } from "../common/codes";
import { PushService } from "../notifications/push.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrderTrackingService } from "./order-tracking.service";
import { PickingEvents } from "./picking.events";
import { PICK_TASK_INCLUDE, toPickTaskDto } from "./picking.mapper";

@Injectable()
export class HandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PickingEvents,
    private readonly tracking: OrderTrackingService,
    private readonly push: PushService,
  ) {}

  /**
   * Handoff (S3.6): packed → ready_for_pickup. Transiciona OrderGroup →
   * ready_for_pickup, gera o pickupCode (exibido ao entregador) e expõe a tarefa
   * na fila de coleta. Idempotente — não regenera o código se já existir.
   */
  async markReady(userId: string, taskId: string) {
    const task = await this.prisma.pickTask.findUnique({
      where: { id: taskId },
      include: { orderGroup: { select: { pickupCode: true, fulfillment: true, storeId: true } } },
    });
    if (!task) throw new NotFoundException({ code: "PICK_TASK_NOT_FOUND", message: "Tarefa não encontrada" });
    if (task.pickerId !== userId) {
      throw new ForbiddenException({ code: "NOT_TASK_OWNER", message: "Tarefa não é sua" });
    }
    if (task.status === "ready_for_pickup") return this.detail(taskId); // idempotente
    if (task.status !== "packed") {
      throw new BadRequestException({
        code: "PICK_TASK_NOT_PACKED",
        message: "Conclua a separação antes de marcá-la pronta",
      });
    }

    await this.prisma.$transaction([
      this.prisma.pickTask.update({
        where: { id: taskId },
        data: { status: "ready_for_pickup", readyAt: new Date() },
      }),
      this.prisma.orderGroup.update({
        where: { id: task.orderGroupId },
        data: {
          status: "ready_for_pickup",
          pickupCode: task.orderGroup.pickupCode ?? shortCode(),
        },
      }),
      // entrega própria: cria a entrega (unassigned) p/ a loja atribuir um entregador.
      // Retirada na loja (pickup) não gera entrega. Idempotente (orderGroupId @unique).
      ...(task.orderGroup.fulfillment === "delivery"
        ? [
            this.prisma.delivery.upsert({
              where: { orderGroupId: task.orderGroupId },
              create: { orderGroupId: task.orderGroupId, storeId: task.orderGroup.storeId },
              update: {},
            }),
          ]
        : []),
    ]);
    await this.tracking.recomputeAndEmit(task.orderGroupId);

    this.events.readyForPickup({
      pickTaskId: task.id,
      storeId: task.storeId,
      orderGroupId: task.orderGroupId,
    });
    await this.pushOwner(
      task.orderGroupId,
      task.orderGroup.fulfillment === "pickup"
        ? { title: "Pedido pronto", body: "Seu pedido está pronto para retirada na loja." }
        : { title: "Pedido pronto", body: "Seu pedido foi separado e aguarda coleta." },
    );
    return this.detail(taskId);
  }

  /**
   * Fila de coleta (contrato p/ a Fase 4): tarefas prontas de uma loja, com
   * endereço de coleta (= endereço da Store) e contagem de itens. Derivada do
   * status → idempotente, sem duplicação. O pickupCode NÃO é exposto aqui (vai
   * ao app do entregador na oferta de rota); a loja valida o código informado.
   */
  async listReadyForPickup(storeId: string) {
    const tasks = await this.prisma.pickTask.findMany({
      where: { storeId, status: "ready_for_pickup" },
      orderBy: { readyAt: "asc" },
      include: {
        _count: { select: { items: true } },
        orderGroup: {
          select: {
            orderId: true,
            store: {
              select: {
                id: true,
                name: true,
                street: true,
                number: true,
                district: true,
                city: true,
                state: true,
                zipCode: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
    });

    return tasks.map((t) => ({
      pickTaskId: t.id,
      orderGroupId: t.orderGroupId,
      orderId: t.orderGroup.orderId,
      readyAt: t.readyAt?.toISOString(),
      pickupAddress: t.orderGroup.store,
      itemCount: t._count.items,
    }));
  }

  /**
   * Coleta confirmada: valida o pickupCode (apresentado pelo entregador, digitado
   * por quem libera) e avança OrderGroup ready_for_pickup → on_the_way. Idempotente.
   * PickTask permanece ready_for_pickup (terminal do picking).
   */
  async confirmPickup(taskId: string, pickupCode: string) {
    const task = await this.prisma.pickTask.findUnique({
      where: { id: taskId },
      include: { orderGroup: { select: { id: true, status: true, pickupCode: true } } },
    });
    if (!task) throw new NotFoundException({ code: "PICK_TASK_NOT_FOUND", message: "Tarefa não encontrada" });
    if (task.orderGroup.status === "on_the_way") return this.detail(taskId); // idempotente
    if (task.status !== "ready_for_pickup") {
      throw new BadRequestException({
        code: "NOT_READY_FOR_PICKUP",
        message: "Tarefa não está pronta para coleta",
      });
    }
    const expected = task.orderGroup.pickupCode;
    if (!expected || pickupCode.trim() !== expected) {
      throw new BadRequestException({
        code: "INVALID_PICKUP_CODE",
        message: "Código de coleta inválido",
      });
    }

    await this.prisma.orderGroup.update({
      where: { id: task.orderGroupId },
      data: { status: "on_the_way" },
    });
    await this.tracking.recomputeAndEmit(task.orderGroupId);
    await this.pushOwner(task.orderGroupId, {
      title: "A caminho",
      body: "Seu pedido saiu para entrega.",
    });
    return this.detail(taskId);
  }

  /**
   * Entrega/retirada concluída: valida o deliveryCode (do Order, informado pelo
   * cliente) e marca o OrderGroup como delivered. Aceita grupos a caminho
   * (on_the_way, entrega própria) ou prontos (ready_for_pickup, retirada na loja).
   * Idempotente. Recalcula o status agregado do pedido.
   */
  async confirmDelivered(orderGroupId: string, deliveryCode: string) {
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: orderGroupId },
      select: { id: true, status: true, order: { select: { deliveryCode: true } } },
    });
    if (!group) {
      throw new NotFoundException({ code: "ORDER_GROUP_NOT_FOUND", message: "Pedido não encontrado" });
    }
    if (group.status === "delivered") return; // idempotente
    if (group.status !== "on_the_way" && group.status !== "ready_for_pickup") {
      throw new BadRequestException({
        code: "NOT_DELIVERABLE",
        message: "Pedido não está pronto para entrega/retirada",
      });
    }
    const expected = group.order.deliveryCode;
    if (!expected || deliveryCode.trim() !== expected) {
      throw new BadRequestException({
        code: "INVALID_DELIVERY_CODE",
        message: "Código de entrega inválido",
      });
    }
    await this.prisma.orderGroup.update({
      where: { id: orderGroupId },
      data: { status: "delivered" },
    });
    await this.tracking.recomputeAndEmit(orderGroupId);
    await this.pushOwner(orderGroupId, {
      title: "Pedido entregue",
      body: "Seu pedido foi concluído. Que tal avaliar?",
    });
  }

  /** Push best-effort ao dono do pedido do grupo (S5.6). */
  private async pushOwner(orderGroupId: string, message: { title: string; body: string }) {
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: orderGroupId },
      select: { orderId: true, order: { select: { userId: true } } },
    });
    if (group) {
      await this.push.sendToUser(group.order.userId, {
        ...message,
        data: { orderId: group.orderId },
      });
    }
  }

  private async detail(taskId: string) {
    const task = await this.prisma.pickTask.findUniqueOrThrow({
      where: { id: taskId },
      include: PICK_TASK_INCLUDE,
    });
    return toPickTaskDto(task);
  }
}
