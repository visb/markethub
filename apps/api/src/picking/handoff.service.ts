import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { OrderStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { boxQrPayload } from "./packing.service";
import { PickingEvents } from "./picking.events";
import { PICK_TASK_INCLUDE, toPickTaskDto } from "./picking.mapper";

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

@Injectable()
export class HandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PickingEvents,
  ) {}

  /**
   * Handoff (S3.6): packed → ready_for_pickup quando todas as caixas estão
   * fechadas. Transiciona OrderGroup → ready_for_pickup e expõe a tarefa na
   * fila de coleta. Idempotente.
   */
  async markReady(userId: string, taskId: string) {
    const task = await this.prisma.pickTask.findUnique({
      where: { id: taskId },
      include: { boxes: { select: { id: true, sealedAt: true } } },
    });
    if (!task) throw new NotFoundException({ code: "PICK_TASK_NOT_FOUND", message: "Tarefa não encontrada" });
    if (task.pickerId !== userId) {
      throw new ForbiddenException({ code: "NOT_TASK_OWNER", message: "Tarefa não é sua" });
    }
    if (task.status === "ready_for_pickup") return this.detail(taskId); // idempotente
    if (task.status !== "packed") {
      throw new BadRequestException({
        code: "PICK_TASK_NOT_PACKED",
        message: "Empacote a tarefa antes de marcá-la pronta",
      });
    }
    if (task.boxes.length === 0 || task.boxes.some((b) => !b.sealedAt)) {
      throw new BadRequestException({
        code: "BOXES_NOT_SEALED",
        message: "Todas as caixas precisam estar fechadas",
      });
    }

    await this.prisma.$transaction([
      this.prisma.pickTask.update({
        where: { id: taskId },
        data: { status: "ready_for_pickup", readyAt: new Date() },
      }),
      this.prisma.orderGroup.update({
        where: { id: task.orderGroupId },
        data: { status: "ready_for_pickup" },
      }),
    ]);
    await this.recomputeOrderStatus(task.orderGroupId);

    this.events.readyForPickup({
      pickTaskId: task.id,
      storeId: task.storeId,
      orderGroupId: task.orderGroupId,
      boxCount: task.boxes.length,
    });
    return this.detail(taskId);
  }

  /**
   * Fila de coleta (contrato p/ a Fase 4): tarefas prontas de uma loja, com
   * caixas e endereço de coleta (= endereço da Store). Derivada do status →
   * idempotente, sem duplicação.
   */
  async listReadyForPickup(storeId: string) {
    const tasks = await this.prisma.pickTask.findMany({
      where: { storeId, status: "ready_for_pickup" },
      orderBy: { readyAt: "asc" },
      include: {
        boxes: { include: { items: { select: { id: true } } } },
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
      boxes: t.boxes.map((b) => ({
        id: b.id,
        serial: b.serial,
        passcode: b.passcode,
        qrPayload: boxQrPayload(b.id),
        itemCount: b.items.length,
      })),
    }));
  }

  /**
   * Coleta confirmada (chamado pelo fluxo da Fase 4): OrderGroup
   * ready_for_pickup → on_the_way. Idempotente. PickTask permanece
   * ready_for_pickup (terminal do picking).
   */
  async confirmPickup(taskId: string) {
    const task = await this.prisma.pickTask.findUnique({
      where: { id: taskId },
      include: { orderGroup: { select: { id: true, status: true } } },
    });
    if (!task) throw new NotFoundException({ code: "PICK_TASK_NOT_FOUND", message: "Tarefa não encontrada" });
    if (task.orderGroup.status === "on_the_way") return this.detail(taskId); // idempotente
    if (task.status !== "ready_for_pickup") {
      throw new BadRequestException({
        code: "NOT_READY_FOR_PICKUP",
        message: "Tarefa não está pronta para coleta",
      });
    }

    await this.prisma.orderGroup.update({
      where: { id: task.orderGroupId },
      data: { status: "on_the_way" },
    });
    await this.recomputeOrderStatus(task.orderGroupId);
    return this.detail(taskId);
  }

  /** Status do Order = etapa menos avançada entre seus grupos. */
  private async recomputeOrderStatus(orderGroupId: string) {
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
  }

  private async detail(taskId: string) {
    const task = await this.prisma.pickTask.findUniqueOrThrow({
      where: { id: taskId },
      include: PICK_TASK_INCLUDE,
    });
    return toPickTaskDto(task);
  }
}
