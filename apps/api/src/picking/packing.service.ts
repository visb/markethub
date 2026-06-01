import { randomInt } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PickingEvents } from "./picking.events";
import { PICK_TASK_INCLUDE, toPickTaskDto } from "./picking.mapper";

/** QR codifica apenas o boxId; resolvido na conferência de entrega (Fase 4). */
export function boxQrPayload(boxId: string): string {
  return `MH-BOX:${boxId}`;
}

/**
 * Empacotamento em caixas (S3.5). O separador cria caixas (serial + passcode +
 * QR), aloca os itens separados/substituídos e fecha a tarefa com `pack`, que
 * exige cobertura total (todo item resolvido positivo está em alguma caixa).
 * Itens recusados não exigem alocação.
 */
@Injectable()
export class PackingService {
  // status em que operações de caixa são permitidas
  private static readonly PACKABLE = ["picking", "packed"] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PickingEvents,
  ) {}

  /** Cria uma caixa para a tarefa, com serial único, passcode e payload de QR. */
  async createBox(userId: string, taskId: string) {
    await this.requirePackableTask(userId, taskId);
    const box = await this.prisma.box.create({
      data: {
        pickTaskId: taskId,
        serial: await this.uniqueSerial(),
        passcode: this.passcode(),
      },
    });
    return this.boxView(box);
  }

  /** Aloca um item separado/substituído a uma caixa (um item em exatamente uma caixa). */
  async allocate(userId: string, taskId: string, boxId: string, itemId: string) {
    await this.requirePackableTask(userId, taskId);
    const box = await this.prisma.box.findFirst({ where: { id: boxId, pickTaskId: taskId } });
    if (!box) throw new NotFoundException({ code: "BOX_NOT_FOUND", message: "Caixa não encontrada" });

    const item = await this.prisma.pickItem.findFirst({ where: { id: itemId, pickTaskId: taskId } });
    if (!item) throw new NotFoundException({ code: "PICK_ITEM_NOT_FOUND", message: "Item não encontrado" });
    if (item.status !== "picked" && item.status !== "substituted") {
      throw new BadRequestException({
        code: "ITEM_NOT_PACKABLE",
        message: "Só itens separados ou substituídos vão para caixas",
      });
    }

    await this.prisma.pickItem.update({ where: { id: itemId }, data: { boxId } });
    return this.boxView(box);
  }

  /** Remove um item da caixa (re-alocação). */
  async unallocate(userId: string, taskId: string, itemId: string) {
    await this.requirePackableTask(userId, taskId);
    const item = await this.prisma.pickItem.findFirst({ where: { id: itemId, pickTaskId: taskId } });
    if (!item) throw new NotFoundException({ code: "PICK_ITEM_NOT_FOUND", message: "Item não encontrado" });
    await this.prisma.pickItem.update({ where: { id: itemId }, data: { boxId: null } });
    return { itemId, boxId: null };
  }

  /**
   * Fecha a separação: valida cobertura total (todo item picked/substituted em
   * alguma caixa) e move picking → packed, selando as caixas. Idempotente.
   */
  async pack(userId: string, taskId: string) {
    const task = await this.requirePackableTask(userId, taskId);

    const pending = await this.prisma.pickItem.count({
      where: { pickTaskId: taskId, status: "pending" },
    });
    if (pending > 0) {
      throw new BadRequestException({
        code: "ITEMS_PENDING",
        message: `Ainda há ${pending} item(ns) a resolver`,
      });
    }

    const unallocated = await this.prisma.pickItem.count({
      where: { pickTaskId: taskId, status: { in: ["picked", "substituted"] }, boxId: null },
    });
    if (unallocated > 0) {
      throw new BadRequestException({
        code: "ITEMS_NOT_PACKED",
        message: `${unallocated} item(ns) separado(s) sem caixa`,
      });
    }

    const boxes = await this.prisma.box.count({ where: { pickTaskId: taskId } });
    if (boxes === 0) {
      throw new BadRequestException({
        code: "NO_BOXES",
        message: "Crie ao menos uma caixa antes de empacotar",
      });
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.box.updateMany({
        where: { pickTaskId: taskId, sealedAt: null },
        data: { sealedAt: now },
      }),
      this.prisma.pickTask.update({
        where: { id: taskId },
        data: task.status === "picking" ? { status: "packed", packedAt: now } : {},
      }),
    ]);

    const updated = await this.prisma.pickTask.findUniqueOrThrow({
      where: { id: taskId },
      include: PICK_TASK_INCLUDE,
    });
    this.events.taskStatusChanged(updated);
    return toPickTaskDto(updated);
  }

  /** Dados da etiqueta imprimível: QR (boxId), serial, passcode, pedido, loja. */
  async label(userId: string, taskId: string, boxId: string) {
    await this.requirePackableTask(userId, taskId);
    const box = await this.prisma.box.findFirst({
      where: { id: boxId, pickTaskId: taskId },
      include: {
        pickTask: {
          select: {
            orderGroup: {
              select: { orderId: true, store: { select: { name: true } } },
            },
          },
        },
        items: { select: { id: true } },
      },
    });
    if (!box) throw new NotFoundException({ code: "BOX_NOT_FOUND", message: "Caixa não encontrada" });

    return {
      boxId: box.id,
      serial: box.serial,
      passcode: box.passcode,
      qrPayload: boxQrPayload(box.id),
      orderId: box.pickTask.orderGroup.orderId,
      storeName: box.pickTask.orderGroup.store.name,
      itemCount: box.items.length,
    };
  }

  private boxView(box: { id: string; serial: string; passcode: string; sealedAt: Date | null }) {
    return {
      id: box.id,
      serial: box.serial,
      passcode: box.passcode,
      sealedAt: box.sealedAt?.toISOString(),
      qrPayload: boxQrPayload(box.id),
    };
  }

  private async requirePackableTask(userId: string, taskId: string) {
    const task = await this.prisma.pickTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException({ code: "PICK_TASK_NOT_FOUND", message: "Tarefa não encontrada" });
    if (task.pickerId !== userId) {
      throw new ForbiddenException({ code: "NOT_TASK_OWNER", message: "Tarefa não é sua" });
    }
    if (!PackingService.PACKABLE.includes(task.status as (typeof PackingService.PACKABLE)[number])) {
      throw new BadRequestException({
        code: "PICK_TASK_NOT_PACKABLE",
        message: "Tarefa precisa estar em separação ou empacotada",
      });
    }
    return task;
  }

  /** Passcode numérico de 4 dígitos (exibido ao cliente — ref: Receive.jpg). */
  private passcode(): string {
    return String(randomInt(0, 10000)).padStart(4, "0");
  }

  /** Serial curto e único (retry em colisão improvável). */
  private async uniqueSerial(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const serial = `BX${randomInt(0, 1_000_000_000).toString(36).toUpperCase().padStart(6, "0")}`;
      const exists = await this.prisma.box.findUnique({ where: { serial } });
      if (!exists) return serial;
    }
    throw new BadRequestException({ code: "SERIAL_GEN_FAILED", message: "Falha ao gerar serial" });
  }
}
