import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PickingEvents } from "./picking.events";
import { PICK_TASK_INCLUDE, toPickTaskDto } from "./picking.mapper";

@Injectable()
export class PickingService {
  private readonly logger = new Logger(PickingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PickingEvents,
  ) {}

  /**
   * Gera uma PickTask (status queued) por OrderGroup do pedido, com um PickItem
   * por OrderItem. Idempotente: OrderGroups que já possuem PickTask são pulados
   * (orderGroupId é @unique). Disparado quando o pedido passa a preparing (S3.2).
   */
  async generateForOrder(orderId: string): Promise<void> {
    const groups = await this.prisma.orderGroup.findMany({
      where: { orderId, pickTask: { is: null } },
      include: { items: { select: { id: true } } },
    });

    for (const group of groups) {
      try {
        const task = await this.prisma.pickTask.create({
          data: {
            orderGroupId: group.id,
            storeId: group.storeId,
            status: "queued",
            items: {
              create: group.items.map((i) => ({ orderItemId: i.id })),
            },
          },
        });
        this.events.taskStatusChanged(task);
      } catch (err) {
        // corrida: outra geração concorrente criou a task (orderGroupId @unique)
        this.logger.warn(`PickTask já existe p/ group ${group.id}: ${String(err)}`);
      }
    }
  }

  /** Fila da loja para o separador: tarefas queued + as já atribuídas a ele. */
  async listQueue(userId: string, storeId: string) {
    await this.assertPickerStore(userId, storeId);

    const tasks = await this.prisma.pickTask.findMany({
      where: {
        storeId,
        OR: [{ status: "queued" }, { pickerId: userId }],
      },
      include: PICK_TASK_INCLUDE,
    });

    // FIFO por tempo efetivo: agendados respeitam a janela (scheduledFrom),
    // demais usam createdAt. (S2.5)
    const effective = (t: (typeof tasks)[number]) =>
      t.orderGroup.order.scheduledFrom?.getTime() ?? t.createdAt.getTime();
    tasks.sort((a, b) => effective(a) - effective(b));

    return tasks.map(toPickTaskDto);
  }

  /** Lojas em que o usuário é separador ativo (para o app escolher a fila). */
  async myStores(userId: string) {
    const staff = await this.prisma.storeStaff.findMany({
      where: { userId, staffRole: "picker", active: true },
      include: { store: { select: { id: true, name: true, merchantId: true } } },
    });
    return staff.map((s) => s.store);
  }

  async getTask(userId: string, id: string) {
    const task = await this.prisma.pickTask.findUnique({
      where: { id },
      include: PICK_TASK_INCLUDE,
    });
    if (!task) throw new NotFoundException({ code: "PICK_TASK_NOT_FOUND", message: "Tarefa não encontrada" });
    await this.assertPickerStore(userId, task.storeId);
    return toPickTaskDto(task);
  }

  /** Separador assume a tarefa (queued → assigned). Lock otimista evita corrida. */
  async assign(userId: string, id: string) {
    const task = await this.prisma.pickTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException({ code: "PICK_TASK_NOT_FOUND", message: "Tarefa não encontrada" });
    await this.assertPickerStore(userId, task.storeId);

    if (task.status !== "queued") {
      throw new BadRequestException({
        code: "PICK_TASK_NOT_QUEUED",
        message: "Tarefa já foi assumida por outro separador",
      });
    }

    // updateMany com guarda de status = compare-and-swap (lock otimista).
    const { count } = await this.prisma.pickTask.updateMany({
      where: { id, status: "queued", pickerId: null },
      data: { status: "assigned", pickerId: userId, assignedAt: new Date() },
    });
    if (count === 0) {
      throw new BadRequestException({
        code: "PICK_TASK_NOT_QUEUED",
        message: "Tarefa já foi assumida por outro separador",
      });
    }

    return this.afterTransition(userId, id);
  }

  /** Libera a tarefa do separador (assigned → queued). Só o dono pode liberar. */
  async release(userId: string, id: string) {
    const task = await this.prisma.pickTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException({ code: "PICK_TASK_NOT_FOUND", message: "Tarefa não encontrada" });

    if (task.pickerId !== userId) {
      throw new ForbiddenException({ code: "NOT_TASK_OWNER", message: "Tarefa não é sua" });
    }
    if (task.status !== "assigned") {
      throw new BadRequestException({
        code: "PICK_TASK_NOT_ASSIGNED",
        message: "Só é possível liberar tarefas atribuídas (não iniciadas)",
      });
    }

    await this.prisma.pickTask.update({
      where: { id },
      data: { status: "queued", pickerId: null, assignedAt: null },
    });
    return this.afterTransition(userId, id);
  }

  private async afterTransition(userId: string, id: string) {
    const updated = await this.prisma.pickTask.findUniqueOrThrow({
      where: { id },
      include: PICK_TASK_INCLUDE,
    });
    this.events.taskStatusChanged(updated);
    return toPickTaskDto(updated);
  }

  /** Garante que o usuário é separador ativo da loja (RBAC picker + escopo storeId). */
  private async assertPickerStore(userId: string, storeId: string) {
    const staff = await this.prisma.storeStaff.findFirst({
      where: { userId, storeId, staffRole: "picker", active: true },
    });
    if (!staff) {
      throw new ForbiddenException({
        code: "NOT_STORE_PICKER",
        message: "Usuário não é separador desta loja",
      });
    }
    return staff;
  }
}
