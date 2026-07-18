import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { DeliveryFailReason, DeliveryStatus } from "@prisma/client";
import { OutboxPublisher } from "../events";
import { HandoffService } from "../picking/handoff.service";
import { OrderTrackingService } from "../picking/order-tracking.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertDriverAvailable } from "./driver-availability.service";
import { DELIVERY_INCLUDE, toDeliveryDto } from "./delivery.mapper";
import { HISTORY_INCLUDE, toHistoryItem } from "./earnings.mapper";

/** Janelas fixas dos ganhos (sem range custom). */
export type EarningsPeriod = "today" | "7d" | "30d";

/** Tamanho de página do histórico de entregas. */
const HISTORY_PAGE_SIZE = 20;

/**
 * Início da janela do período. `today` = 00:00 do dia corrente (hora do servidor);
 * `7d`/`30d` = agora menos N dias. Exportado para teste direto do recorte.
 */
export function earningsPeriodStart(period: EarningsPeriod, now: Date = new Date()): Date {
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Entrega própria — lado do entregador. O entregador é vinculado a uma loja
 * (StoreStaff role driver). Pool aberto: ao ficar pronta, a entrega fica
 * disponível para todos os entregadores da loja; quem aceitar primeiro fica
 * com ela (lock otimista). Coleta valida o pickupCode (reusa HandoffService);
 * entrega valida o deliveryCode do cliente.
 */
@Injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly handoff: HandoffService,
    private readonly tracking: OrderTrackingService,
    private readonly outbox: OutboxPublisher,
  ) {}

  /** Lojas em que o usuário atua como entregador (para o app escolher a fila). */
  async myStores(userId: string) {
    const staff = await this.prisma.storeStaff.findMany({
      where: { userId, staffRole: "driver", active: true },
      include: { store: { select: { id: true, name: true, merchantId: true } } },
    });
    return staff.map((s) => s.store);
  }

  /**
   * Pool aberto: entregas prontas e ainda sem entregador (unassigned) nas lojas
   * em que o usuário atua. Qualquer um pode aceitar; a primeira aceitação vence.
   */
  async listAvailable(userId: string, opts: { storeId?: string } = {}) {
    const storeIds = await this.myStoreIds(userId);
    if (storeIds.length === 0) return [];
    // opts.storeId vem do cliente — só vale se for uma das lojas do entregador.
    const scope = opts.storeId && storeIds.includes(opts.storeId) ? [opts.storeId] : storeIds;
    const deliveries = await this.prisma.delivery.findMany({
      where: { storeId: { in: scope }, status: "unassigned" as DeliveryStatus },
      orderBy: { createdAt: "asc" },
      include: DELIVERY_INCLUDE,
    });
    return deliveries.map(toDeliveryDto);
  }

  /**
   * Aceita uma entrega do pool (auto-atribuição). Lock otimista unassigned →
   * assigned: se outro entregador já aceitou, falha com DELIVERY_ALREADY_TAKEN.
   */
  async accept(userId: string, deliveryId: string) {
    const delivery = await this.loadDelivery(deliveryId);
    const isDriver = await this.prisma.storeStaff.findFirst({
      where: { userId, storeId: delivery.storeId, staffRole: "driver", active: true },
    });
    if (!isDriver) {
      throw new ForbiddenException({
        code: "NOT_STORE_DRIVER",
        message: "Você não é entregador desta loja",
      });
    }
    // Turno on/off (story 62): só aceita quem está disponível (em turno).
    await assertDriverAvailable(this.prisma, userId);
    const { count } = await this.prisma.delivery.updateMany({
      where: { id: deliveryId, status: "unassigned" },
      data: { status: "assigned", driverId: userId, assignedAt: new Date() },
    });
    if (count === 0) {
      throw new BadRequestException({
        code: "DELIVERY_ALREADY_TAKEN",
        message: "Entrega já foi aceita por outro entregador",
      });
    }
    const group = await this.prisma.orderGroup.findUnique({
      where: { id: delivery.orderGroupId },
      select: { orderId: true },
    });
    if (group) await this.tracking.emit(group.orderId);
    return this.detail(deliveryId);
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

  /**
   * Reporta falha na entrega (story 61). Só o entregador DONO e só após a coleta
   * (`picked_up`) — antes de coletar ele simplesmente não aceita/desatribui. Na
   * MESMA TX: Delivery → `failed` (grava a ÚLTIMA falha: motivo + observação) e
   * evento `delivery.failed` no outbox (push ao cliente + realtime ao merchant
   * são handlers do evento — padrão story 48). O OrderGroup NÃO ganha estado novo
   * (painéis derivam da Delivery). A loja decide depois: reenviar (retry) ou
   * cancelar o sub-pedido (story 54). Idempotente quando já está `failed`.
   */
  async fail(userId: string, deliveryId: string, reason: DeliveryFailReason, note?: string) {
    const delivery = await this.ownedDelivery(userId, deliveryId);
    if (delivery.status === "failed") return this.detail(deliveryId); // idempotente
    if (delivery.status !== "picked_up") {
      throw new BadRequestException({
        code: "DELIVERY_NOT_PICKED_UP",
        message: "Só é possível reportar falha após a coleta",
      });
    }
    const group = await this.prisma.orderGroup.findUniqueOrThrow({
      where: { id: delivery.orderGroupId },
      select: { orderId: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: deliveryId },
        data: { status: "failed", failReason: reason, failNote: note ?? null, failedAt: new Date() },
      });
      await this.outbox.publish(tx, {
        type: "delivery.failed",
        payload: { orderId: group.orderId, groupId: delivery.orderGroupId, deliveryId, reason },
        aggregateId: group.orderId,
      });
    });
    return this.detail(deliveryId);
  }

  /**
   * Ganhos do entregador no período (story 60). Own-store: só gorjeta é ganho.
   * Gorjeta paga (status=paid, filtrada por `paidAt`) soma no "recebido"; a
   * pendente aparece separada (por `createdAt`, sem somar). Conta também as
   * entregas concluídas (delivered) no período. Consulta `Tip`/`Delivery` direto
   * via Prisma (kernel compartilhado) — sem import de internals de outro contexto.
   */
  async earnings(userId: string, period: EarningsPeriod) {
    const start = earningsPeriodStart(period);
    // Gorjeta do entregador soma os TipItem (target=driver) deste entregador, com o
    // status/data herdados do Tip agregado (story 77). Legado coberto pelo backfill.
    const [paid, pending, deliveriesCompleted] = await Promise.all([
      this.prisma.tipItem.aggregate({
        where: {
          target: "driver",
          targetDriverId: userId,
          tip: { status: "paid", paidAt: { gte: start } },
        },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      this.prisma.tipItem.aggregate({
        where: {
          target: "driver",
          targetDriverId: userId,
          tip: { status: "pending", createdAt: { gte: start } },
        },
        _sum: { amountCents: true },
      }),
      this.prisma.delivery.count({
        where: { driverId: userId, status: "delivered", deliveredAt: { gte: start } },
      }),
    ]);
    return {
      period,
      tipsPaidCents: paid._sum.amountCents ?? 0,
      tipsPaidCount: paid._count._all,
      tipsPendingCents: pending._sum.amountCents ?? 0,
      deliveriesCompleted,
    };
  }

  /**
   * Histórico paginado de entregas concluídas/canceladas do entregador (story 60),
   * desc por data (entregue/cancelada). Anexa a gorjeta do pedido quando ela é
   * deste entregador. Busca `pageSize + 1` para saber se há próxima página.
   *
   * Recorta pelo mesmo período dos cards de resumo (story 79): reusa
   * `earningsPeriodStart` e filtra pela data que o item exibe — entregue por
   * `deliveredAt`, cancelada (sem `deliveredAt`) por `updatedAt`. Default `30d`
   * mantém compat com chamadas sem o período.
   */
  async deliveryHistory(userId: string, page = 1, period: EarningsPeriod = "30d") {
    const currentPage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
    const start = earningsPeriodStart(period);
    const rows = await this.prisma.delivery.findMany({
      where: {
        driverId: userId,
        status: { in: ["delivered", "canceled"] },
        OR: [
          { status: "delivered", deliveredAt: { gte: start } },
          { status: "canceled", updatedAt: { gte: start } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      skip: (currentPage - 1) * HISTORY_PAGE_SIZE,
      take: HISTORY_PAGE_SIZE + 1,
      include: HISTORY_INCLUDE,
    });
    const hasMore = rows.length > HISTORY_PAGE_SIZE;
    const items = rows.slice(0, HISTORY_PAGE_SIZE).map((r) => toHistoryItem(r, userId));
    return { items, page: currentPage, pageSize: HISTORY_PAGE_SIZE, hasMore };
  }

  /** IDs das lojas em que o usuário é entregador ativo. */
  private async myStoreIds(userId: string): Promise<string[]> {
    const staff = await this.prisma.storeStaff.findMany({
      where: { userId, staffRole: "driver", active: true },
      select: { storeId: true },
    });
    return staff.map((s) => s.storeId);
  }

  /** Carrega a entrega ou 404. */
  private async loadDelivery(deliveryId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      throw new NotFoundException({ code: "DELIVERY_NOT_FOUND", message: "Entrega não encontrada" });
    }
    return delivery;
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
