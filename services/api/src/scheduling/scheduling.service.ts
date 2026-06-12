import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

interface CreateSlotInput {
  storeId: string;
  start: string;
  end: string;
  capacity: number;
}

/**
 * Agendamento por capacidade / slots por loja (S5.3). Cada loja entrega o próprio
 * pedido; a capacidade limita pedidos por janela. A reserva decrementa a vaga no
 * checkout e é liberada ao cancelar. Vale p/ entrega e retirada.
 */
@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Slots da loja com vaga (reserved < capacity), a partir de agora. */
  async listAvailable(storeId: string, opts: { from?: Date; to?: Date } = {}) {
    const from = opts.from ?? new Date();
    const slots = await this.prisma.deliverySlot.findMany({
      where: {
        storeId,
        start: { gte: from, ...(opts.to ? { lte: opts.to } : {}) },
      },
      orderBy: { start: "asc" },
    });
    return slots
      .filter((s) => s.reserved < s.capacity)
      .map((s) => ({
        id: s.id,
        storeId: s.storeId,
        start: s.start.toISOString(),
        end: s.end.toISOString(),
        capacity: s.capacity,
        reserved: s.reserved,
        remaining: s.capacity - s.reserved,
      }));
  }

  /** Cria um slot (manager/admin da loja). */
  async create(userId: string, roles: string[], input: CreateSlotInput) {
    await this.assertStoreManager(userId, roles, input.storeId);
    const start = new Date(input.start);
    const end = new Date(input.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException({ code: "INVALID_SLOT_WINDOW", message: "Janela inválida" });
    }
    if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
      throw new BadRequestException({ code: "INVALID_CAPACITY", message: "Capacidade inválida" });
    }
    return this.prisma.deliverySlot.upsert({
      where: { storeId_start_end: { storeId: input.storeId, start, end } },
      create: { storeId: input.storeId, start, end, capacity: input.capacity },
      update: { capacity: input.capacity },
    });
  }

  /** Lista slots da loja (gestão — inclui cheios). */
  async listForStore(userId: string, roles: string[], storeId: string) {
    await this.assertStoreManager(userId, roles, storeId);
    return this.prisma.deliverySlot.findMany({
      where: { storeId, start: { gte: new Date() } },
      orderBy: { start: "asc" },
    });
  }

  /** Remove um slot (manager/admin da loja). Bloqueia se já houver reserva. */
  async deleteSlot(userId: string, roles: string[], slotId: string) {
    const slot = await this.prisma.deliverySlot.findUnique({ where: { id: slotId } });
    if (!slot) throw new BadRequestException({ code: "SLOT_NOT_FOUND", message: "Slot não encontrado" });
    await this.assertStoreManager(userId, roles, slot.storeId);
    if (slot.reserved > 0) {
      throw new BadRequestException({ code: "SLOT_HAS_RESERVATIONS", message: "Slot com reservas" });
    }
    await this.prisma.deliverySlot.delete({ where: { id: slotId } });
    return { removed: true };
  }

  /**
   * Reserva atômica de uma vaga (usado no checkout, dentro da transação). Valida
   * que o slot pertence a uma das lojas do carrinho e que há vaga. Retorna a janela.
   */
  async reserveInTx(tx: Prisma.TransactionClient, slotId: string, storeIds: string[]) {
    const slot = await tx.deliverySlot.findUnique({ where: { id: slotId } });
    if (!slot || !storeIds.includes(slot.storeId)) {
      throw new BadRequestException({ code: "SLOT_NOT_FOUND", message: "Horário indisponível" });
    }
    const { count } = await tx.deliverySlot.updateMany({
      where: { id: slotId, reserved: { lt: slot.capacity } },
      data: { reserved: { increment: 1 } },
    });
    if (count === 0) {
      throw new BadRequestException({ code: "SLOT_FULL", message: "Horário esgotado" });
    }
    return { start: slot.start, end: slot.end };
  }

  /** Libera a vaga ao cancelar o pedido (não desce abaixo de zero). */
  async release(slotId: string) {
    await this.prisma.deliverySlot.updateMany({
      where: { id: slotId, reserved: { gt: 0 } },
      data: { reserved: { decrement: 1 } },
    });
  }

  private async assertStoreManager(userId: string, roles: string[], storeId: string) {
    if (roles.includes("admin")) return;
    const staff = await this.prisma.storeStaff.findFirst({
      where: { userId, storeId, staffRole: "manager", active: true },
    });
    if (!staff) {
      throw new ForbiddenException({ code: "NOT_STORE_MANAGER", message: "Sem acesso à loja" });
    }
  }
}
