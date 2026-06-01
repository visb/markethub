import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { computeItemTotal } from "../marketplace/pricing";
import { PrismaService } from "../prisma/prisma.service";
import { PickingEvents } from "./picking.events";
import { PICK_TASK_INCLUDE, toPickItemDto, toPickTaskDto } from "./picking.mapper";

export type PickItemAction = "pick" | "refuse";

export interface UpdatePickItemInput {
  action: PickItemAction;
  quantityPicked?: number;
  weightGramsPicked?: number;
  refusalReason?: string;
}

/**
 * Sessão de separação item a item (S3.3). O separador inicia a separação,
 * resolve cada item (pick/refuse) e conclui. Substituição (substitute) é
 * tratada à parte em S3.4. Recalcula subtotal do OrderGroup e total do Order
 * conforme itens recusados / quantidade real.
 */
@Injectable()
export class PickingSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PickingEvents,
  ) {}

  /** assigned → picking. Só o dono inicia. */
  async start(userId: string, taskId: string) {
    const task = await this.requireOwnedTask(userId, taskId);
    if (task.status === "picking") return this.detail(taskId); // idempotente
    if (task.status !== "assigned") {
      throw new BadRequestException({
        code: "PICK_TASK_NOT_ASSIGNED",
        message: "Tarefa precisa estar atribuída para iniciar",
      });
    }
    await this.prisma.pickTask.update({
      where: { id: taskId },
      data: { status: "picking", startedAt: new Date() },
    });
    return this.afterChange(taskId);
  }

  /** Resolve um item: pick (com quantidade/peso) ou refuse (com motivo). Idempotente. */
  async updateItem(userId: string, taskId: string, itemId: string, input: UpdatePickItemInput) {
    const task = await this.requireOwnedTask(userId, taskId);
    if (task.status !== "picking") {
      throw new BadRequestException({
        code: "PICK_TASK_NOT_PICKING",
        message: "Inicie a separação antes de resolver itens",
      });
    }

    const item = await this.prisma.pickItem.findFirst({
      where: { id: itemId, pickTaskId: taskId },
      include: { orderItem: true },
    });
    if (!item) {
      throw new NotFoundException({ code: "PICK_ITEM_NOT_FOUND", message: "Item não encontrado" });
    }

    const oi = item.orderItem;
    const now = new Date();

    if (input.action === "pick") {
      const data =
        oi.saleType === "weight"
          ? this.validateWeightPick(input)
          : this.validateUnitPick(input, oi.quantity);
      await this.prisma.pickItem.update({
        where: { id: itemId },
        data: {
          status: "picked",
          ...data,
          refusalReason: null,
          pickedById: userId,
          pickedAt: now,
        },
      });
    } else {
      // refuse
      const reason = input.refusalReason?.trim();
      if (!reason) {
        throw new BadRequestException({
          code: "REFUSAL_REASON_REQUIRED",
          message: "Motivo é obrigatório ao recusar um item",
        });
      }
      await this.prisma.pickItem.update({
        where: { id: itemId },
        data: {
          status: "refused",
          refusalReason: reason,
          quantityPicked: null,
          weightGramsPicked: null,
          pickedById: userId,
          pickedAt: now,
        },
      });
    }

    await this.recalcTotals(task.orderGroupId);
    const updated = await this.prisma.pickItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { orderItem: true, substitution: true },
    });
    this.events.itemUpdated({
      orderGroupId: task.orderGroupId,
      pickItemId: itemId,
      status: updated.status,
    });
    return toPickItemDto(updated);
  }

  /** picking → packed. Pré-condição: nenhum item pendente. Recalcula totais. */
  async completePicking(userId: string, taskId: string) {
    const task = await this.requireOwnedTask(userId, taskId);
    if (task.status === "packed") return this.detail(taskId); // idempotente
    if (task.status !== "picking") {
      throw new BadRequestException({
        code: "PICK_TASK_NOT_PICKING",
        message: "Tarefa não está em separação",
      });
    }

    const pending = await this.prisma.pickItem.count({
      where: { pickTaskId: taskId, status: "pending" },
    });
    if (pending > 0) {
      throw new BadRequestException({
        code: "ITEMS_PENDING",
        message: `Ainda há ${pending} item(ns) a resolver`,
      });
    }

    await this.recalcTotals(task.orderGroupId);
    await this.prisma.pickTask.update({
      where: { id: taskId },
      data: { status: "packed", packedAt: new Date() },
    });
    return this.afterChange(taskId);
  }

  /**
   * Recalcula subtotal do OrderGroup (e itemsCents/totalCents do Order) a partir
   * do estado dos PickItems. Pendentes mantêm o valor pedido; recusados zeram;
   * substituídos usam o snapshot da substituição; separados usam a quantidade real.
   */
  async recalcTotals(orderGroupId: string) {
    const group = await this.prisma.orderGroup.findUniqueOrThrow({
      where: { id: orderGroupId },
      include: { items: { include: { pickItem: { include: { substitution: true } } } } },
    });

    let subtotal = 0;
    for (const oi of group.items) {
      const pi = oi.pickItem;
      if (!pi || pi.status === "pending") {
        subtotal += oi.lineTotalCents;
      } else if (pi.status === "refused") {
        // removido: não soma
      } else if (pi.status === "substituted" && pi.substitution) {
        subtotal += pi.substitution.unitPriceCents * oi.quantity;
      } else {
        // picked
        subtotal += computeItemTotal({
          saleType: oi.saleType,
          unitPriceCents: oi.unitPriceCents,
          quantity: pi.quantityPicked ?? oi.quantity,
          weightGrams: pi.weightGramsPicked ?? oi.weightGrams,
        });
      }
    }

    await this.prisma.orderGroup.update({
      where: { id: orderGroupId },
      data: { subtotalCents: subtotal },
    });

    // recompõe os totais do Order a partir dos subtotais dos grupos
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: group.orderId },
      include: { groups: { select: { subtotalCents: true } } },
    });
    const itemsCents = order.groups.reduce((s, g) => s + g.subtotalCents, 0);
    const totalCents = Math.max(
      0,
      itemsCents +
        order.deliveryCents +
        order.prepCents +
        order.platformFeeCents -
        order.discountCents,
    );
    await this.prisma.order.update({
      where: { id: order.id },
      data: { itemsCents, totalCents },
    });
  }

  private validateUnitPick(input: UpdatePickItemInput, ordered: number) {
    const qty = input.quantityPicked;
    if (qty == null || !Number.isInteger(qty) || qty < 1) {
      throw new BadRequestException({
        code: "INVALID_QUANTITY",
        message: "quantityPicked deve ser inteiro ≥ 1",
      });
    }
    if (qty > ordered) {
      throw new BadRequestException({
        code: "QUANTITY_EXCEEDS_ORDERED",
        message: `Não é possível separar mais que o pedido (${ordered})`,
      });
    }
    return { quantityPicked: qty, weightGramsPicked: null };
  }

  private validateWeightPick(input: UpdatePickItemInput) {
    const grams = input.weightGramsPicked;
    // peso real pode diferir do pedido (S3.3 nota); exige apenas valor positivo
    if (grams == null || !Number.isInteger(grams) || grams < 1) {
      throw new BadRequestException({
        code: "INVALID_WEIGHT",
        message: "weightGramsPicked deve ser inteiro ≥ 1 (gramas)",
      });
    }
    return { weightGramsPicked: grams, quantityPicked: null };
  }

  private async requireOwnedTask(userId: string, taskId: string) {
    const task = await this.prisma.pickTask.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException({ code: "PICK_TASK_NOT_FOUND", message: "Tarefa não encontrada" });
    }
    if (task.pickerId !== userId) {
      throw new ForbiddenException({ code: "NOT_TASK_OWNER", message: "Tarefa não é sua" });
    }
    return task;
  }

  private async detail(taskId: string) {
    const task = await this.prisma.pickTask.findUniqueOrThrow({
      where: { id: taskId },
      include: PICK_TASK_INCLUDE,
    });
    return toPickTaskDto(task);
  }

  private async afterChange(taskId: string) {
    const task = await this.prisma.pickTask.findUniqueOrThrow({
      where: { id: taskId },
      include: PICK_TASK_INCLUDE,
    });
    this.events.taskStatusChanged(task);
    return toPickTaskDto(task);
  }
}
