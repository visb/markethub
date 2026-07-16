import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { computePickerMetrics } from "../picking";
import type { CompletedPickTaskShape } from "../picking";
import { PrismaService } from "../prisma/prisma.service";
import { VISIBLE_REVIEWS } from "../reviews";
import { MerchantService } from "./merchant.service";

/** Janela padrão dos relatórios quando o usuário não informa período. */
const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

interface ReportFilter {
  from?: string;
  to?: string;
  storeId?: string;
}

interface Period {
  from: Date;
  to: Date;
}

/**
 * Relatórios do app merchant (story 13). Reusa a forma das agregações do
 * dashboard admin (S5.4), trocando o escopo global pelas lojas do usuário:
 * owner vê todas as lojas das suas redes; manager só os vínculos. Tudo é
 * agregação de leitura (sem mudança de schema). O escopo é SEMPRE reforçado
 * aqui (a tela nunca é a fonte da verdade — CLAUDE.md).
 */
@Injectable()
export class MerchantReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchant: MerchantService,
  ) {}

  /** Normaliza o período: from/to do filtro ou janela padrão (últimos 30d). */
  private resolvePeriod(filter: ReportFilter): Period {
    const to = filter.to ? new Date(filter.to) : new Date();
    const from = filter.from ? new Date(filter.from) : new Date(to.getTime() - DEFAULT_WINDOW_MS);
    return { from, to };
  }

  /**
   * Resolve as lojas-alvo dentro do escopo do usuário. Sem vínculo → FORBIDDEN;
   * loja informada fora do escopo → FORBIDDEN. Devolve também os merchantIds das
   * redes (reviews têm alvo merchant, não store).
   */
  private async resolveScope(
    user: { id: string; roles: string[] },
    storeId?: string,
  ): Promise<{ storeIds: string[]; merchantIds: string[] }> {
    const scope = await this.merchant.scopedStores(user);
    if (scope.storeIds.length === 0) {
      throw new ForbiddenException({ code: "NOT_A_MERCHANT_USER", message: "Usuário sem lojas no escopo" });
    }
    if (storeId) {
      if (!scope.storeIds.includes(storeId)) {
        throw new ForbiddenException({ code: "STORE_NOT_IN_SCOPE", message: "Loja fora do escopo do usuário" });
      }
      const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { merchantId: true } });
      return { storeIds: [storeId], merchantIds: store ? [store.merchantId] : scope.merchantIds };
    }
    return scope;
  }

  /** Vendas/faturamento: pedidos pagos no período cujos grupos estão no escopo. */
  async sales(user: { id: string; roles: string[] }, filter: ReportFilter) {
    const { storeIds } = await this.resolveScope(user, filter.storeId);
    const { from, to } = this.resolvePeriod(filter);

    const orderWhere: Prisma.OrderWhereInput = {
      payment: { is: { status: "paid", paidAt: { gte: from, lte: to } } },
      groups: { some: { storeId: { in: storeIds } } },
    };
    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: {
        totalCents: true,
        platformFeeCents: true,
        refund: { select: { amountCents: true, status: true } },
      },
    });

    const ordersPaid = orders.length;
    const salesCents = orders.reduce((s, o) => s + o.totalCents, 0);
    const platformFeeCents = orders.reduce((s, o) => s + o.platformFeeCents, 0);
    const refundsCents = orders.reduce(
      (s, o) => s + (o.refund && o.refund.status !== "failed" ? o.refund.amountCents : 0),
      0,
    );

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      ordersPaid,
      salesCents,
      platformFeeCents,
      refundsCents,
      ticketCents: ordersPaid > 0 ? Math.round(salesCents / ordersPaid) : 0,
      estimatedPayoutCents: salesCents - platformFeeCents - refundsCents,
    };
  }

  /** Operacional: pedidos/separação/entrega por status no escopo + período. */
  async operations(user: { id: string; roles: string[] }, filter: ReportFilter) {
    const { storeIds } = await this.resolveScope(user, filter.storeId);
    const { from, to } = this.resolvePeriod(filter);
    const createdAt = { gte: from, lte: to };

    const [orderByStatus, pickByStatus, deliveryByStatus, pendingPickups] = await Promise.all([
      this.prisma.orderGroup.groupBy({
        by: ["status"],
        where: { storeId: { in: storeIds }, order: { is: { createdAt } } },
        _count: { _all: true },
      }),
      this.prisma.pickTask.groupBy({
        by: ["status"],
        where: { storeId: { in: storeIds }, createdAt },
        _count: { _all: true },
      }),
      this.prisma.delivery.groupBy({
        by: ["status"],
        where: { storeId: { in: storeIds }, createdAt },
        _count: { _all: true },
      }),
      this.prisma.orderGroup.count({
        where: { storeId: { in: storeIds }, fulfillment: "pickup", status: "ready_for_pickup" },
      }),
    ]);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      ordersByStatus: Object.fromEntries(orderByStatus.map((o) => [o.status, o._count._all])),
      picking: Object.fromEntries(pickByStatus.map((p) => [p.status, p._count._all])),
      deliveries: Object.fromEntries(deliveryByStatus.map((d) => [d.status, d._count._all])),
      pendingPickups,
    };
  }

  /** Top produtos: agrega quantidade + receita por produto, ordenado desc. */
  async topProducts(user: { id: string; roles: string[] }, filter: ReportFilter, limit = 10) {
    const { storeIds } = await this.resolveScope(user, filter.storeId);
    const { from, to } = this.resolvePeriod(filter);
    const take = Math.min(50, Math.max(1, limit));

    const rows = await this.prisma.orderItem.groupBy({
      by: ["productId", "nameSnapshot"],
      where: { group: { is: { storeId: { in: storeIds }, order: { is: { createdAt: { gte: from, lte: to } } } } } },
      _sum: { quantity: true, lineTotalCents: true },
    });

    const items = rows
      .map((r) => ({
        productId: r.productId,
        name: r.nameSnapshot,
        quantity: r._sum.quantity ?? 0,
        revenueCents: r._sum.lineTotalCents ?? 0,
      }))
      .sort((a, b) => b.quantity - a.quantity || b.revenueCents - a.revenueCents)
      .slice(0, take);

    return { period: { from: from.toISOString(), to: to.toISOString() }, items };
  }

  /**
   * Separação por colaborador (story 65): tasks concluídas (`readyAt` no
   * período) nas lojas do escopo, agrupadas por picker, com as MESMAS métricas
   * do app do separador (`computePickerMetrics`, barrel do fulfillment).
   */
  async pickers(user: { id: string; roles: string[] }, filter: ReportFilter) {
    const { storeIds } = await this.resolveScope(user, filter.storeId);
    const { from, to } = this.resolvePeriod(filter);

    const tasks = await this.prisma.pickTask.findMany({
      where: { storeId: { in: storeIds }, pickerId: { not: null }, readyAt: { gte: from, lte: to } },
      select: {
        pickerId: true,
        startedAt: true,
        packedAt: true,
        picker: { select: { name: true } },
        items: { select: { status: true } },
      },
    });

    const byPicker = new Map<string, { name: string; tasks: CompletedPickTaskShape[] }>();
    for (const task of tasks) {
      const id = task.pickerId as string;
      const entry = byPicker.get(id) ?? { name: task.picker?.name ?? "—", tasks: [] };
      entry.tasks.push(task);
      byPicker.set(id, entry);
    }

    const rows = [...byPicker.entries()]
      .map(([pickerId, entry]) => ({ pickerId, name: entry.name, ...computePickerMetrics(entry.tasks) }))
      .sort((a, b) => b.tasksCompleted - a.tasksCompleted || a.name.localeCompare(b.name));

    return { period: { from: from.toISOString(), to: to.toISOString() }, rows };
  }

  /** Avaliações por eixo no período. merchant é escopado às redes do usuário. */
  async reviews(user: { id: string; roles: string[] }, filter: ReportFilter) {
    const { merchantIds } = await this.resolveScope(user, filter.storeId);
    const { from, to } = this.resolvePeriod(filter);

    const rows = await this.prisma.review.groupBy({
      by: ["axis"],
      where: {
        createdAt: { gte: from, lte: to },
        // moderação (story 68): oculta pelo admin sai das médias do relatório
        ...VISIBLE_REVIEWS,
        OR: [
          { axis: { in: ["platform", "delivery"] } },
          { axis: "merchant", targetMerchantId: { in: merchantIds } },
        ],
      },
      _avg: { rating: true },
      _count: { _all: true },
    });

    const axes = rows.map((r) => ({
      axis: r.axis,
      average: r._avg.rating ? Math.round(r._avg.rating * 100) / 100 : 0,
      count: r._count._all,
    }));

    return { period: { from: from.toISOString(), to: to.toISOString() }, axes };
  }
}
