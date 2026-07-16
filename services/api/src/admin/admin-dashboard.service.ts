import { Injectable } from "@nestjs/common";
import type { OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

interface OrdersFilter {
  status?: OrderStatus;
  storeId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
  /** Busca do suporte (story 67): id EXATO do pedido, nome ou e-mail do cliente. */
  q?: string;
}

interface PeriodFilter {
  from?: Date;
  to?: Date;
  storeId?: string;
}

/**
 * Agregações do dashboard admin (S5.4): pedidos, operação (separação/entregas)
 * e financeiro (vendas, reembolsos, gorjetas, repasse estimado). Somente admin.
 */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista/busca de pedidos com filtros + contagem por status. */
  async orders(filter: OrdersFilter) {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
    const where: Prisma.OrderWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.storeId ? { groups: { some: { storeId: filter.storeId } } } : {}),
      ...(filter.from || filter.to
        ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
        : {}),
      // busca do suporte (story 67): id exato OU nome/e-mail contains insensitive.
      // Telefone entra quando a story de conta/perfil criar o campo no User.
      ...(filter.q
        ? {
            OR: [
              { id: filter.q },
              { user: { is: { name: { contains: filter.q, mode: "insensitive" as const } } } },
              { user: { is: { email: { contains: filter.q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };

    const [items, total, statusGroups] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          totalCents: true,
          createdAt: true,
          user: { select: { name: true } },
          payment: { select: { status: true } },
          refund: { select: { amountCents: true, status: true } },
          groups: { select: { store: { select: { name: true } }, fulfillment: true, status: true } },
        },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({ by: ["status"], where, _count: { _all: true } }),
    ]);

    return {
      items: items.map((o) => ({
        id: o.id,
        status: o.status,
        totalCents: o.totalCents,
        createdAt: o.createdAt.toISOString(),
        customer: o.user.name,
        paymentStatus: o.payment?.status ?? null,
        refundCents: o.refund && o.refund.status !== "failed" ? o.refund.amountCents : 0,
        stores: o.groups.map((g) => g.store.name),
        fulfillments: o.groups.map((g) => g.fulfillment),
      })),
      total,
      page,
      pageSize,
      statusCounts: Object.fromEntries(statusGroups.map((s) => [s.status, s._count._all])),
    };
  }

  /** Detalhe completo do pedido (grupos, separação c/ substituições, entrega, pagamento, reembolso). */
  orderDetail(id: string) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        address: true,
        payment: true,
        refund: { include: { components: true } },
        groups: {
          include: {
            merchant: { select: { name: true } },
            store: { select: { name: true } },
            // itens com resolução da separação + substituição (story 67: suporte vê o que foi trocado)
            items: {
              include: {
                pickItem: {
                  select: {
                    status: true,
                    quantityPicked: true,
                    weightGramsPicked: true,
                    substitution: {
                      select: { nameSnapshot: true, unitPriceCents: true, approvalStatus: true },
                    },
                  },
                },
              },
            },
            pickTask: { select: { id: true, status: true, pickerId: true } },
            delivery: { select: { id: true, status: true, driver: { select: { name: true } } } },
          },
        },
      },
    });
  }

  /** Operação: filas de separação e entregas por loja + retiradas pendentes + SLA. */
  async operations(storeId?: string) {
    const storeWhere = storeId ? { storeId } : {};
    const [pickByStatus, deliveryByStatus, pendingPickups, oldestQueued, oldestUnassigned] =
      await Promise.all([
        this.prisma.pickTask.groupBy({ by: ["status"], where: storeWhere, _count: { _all: true } }),
        this.prisma.delivery.groupBy({ by: ["status"], where: storeWhere, _count: { _all: true } }),
        this.prisma.orderGroup.count({
          where: { ...storeWhere, fulfillment: "pickup", status: "ready_for_pickup" },
        }),
        this.prisma.pickTask.findFirst({
          where: { ...storeWhere, status: "queued" },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        this.prisma.delivery.findFirst({
          where: { ...storeWhere, status: "unassigned" },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]);

    const ageMin = (d?: { createdAt: Date } | null) =>
      d ? Math.round((Date.now() - d.createdAt.getTime()) / 60000) : null;

    return {
      picking: Object.fromEntries(pickByStatus.map((p) => [p.status, p._count._all])),
      deliveries: Object.fromEntries(deliveryByStatus.map((d) => [d.status, d._count._all])),
      pendingPickups,
      sla: {
        oldestQueuedPickMin: ageMin(oldestQueued),
        oldestUnassignedDeliveryMin: ageMin(oldestUnassigned),
      },
    };
  }

  /** Financeiro do período: vendas, reembolsos, gorjetas e repasse estimado. */
  async finance(filter: PeriodFilter) {
    const paidRange =
      filter.from || filter.to
        ? { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) }
        : undefined;

    // pedidos pagos no período (filtra por loja via grupos)
    const orderWhere: Prisma.OrderWhereInput = {
      payment: { is: { status: "paid", ...(paidRange ? { paidAt: paidRange } : {}) } },
      ...(filter.storeId ? { groups: { some: { storeId: filter.storeId } } } : {}),
    };
    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      select: {
        totalCents: true,
        platformFeeCents: true,
        refund: { select: { amountCents: true, status: true } },
      },
    });

    const salesCents = orders.reduce((s, o) => s + o.totalCents, 0);
    const platformFeeCents = orders.reduce((s, o) => s + o.platformFeeCents, 0);
    const refundsCents = orders.reduce(
      (s, o) => s + (o.refund && o.refund.status !== "failed" ? o.refund.amountCents : 0),
      0,
    );

    const tipAgg = await this.prisma.tip.aggregate({
      where: { status: "paid", ...(paidRange ? { paidAt: paidRange } : {}) },
      _sum: { amountCents: true },
      _count: { _all: true },
    });
    const tipsCents = tipAgg._sum.amountCents ?? 0;

    return {
      ordersPaid: orders.length,
      salesCents,
      platformFeeCents,
      refundsCents,
      tipsCents,
      tipsCount: tipAgg._count._all,
      // repasse estimado ao merchant (vendas − taxa plataforma − reembolsos)
      estimatedMerchantPayoutCents: salesCents - platformFeeCents - refundsCents,
    };
  }

  /** Total de gorjetas pagas por entregador no período (S5.2/S5.4). */
  async driverTips(filter: PeriodFilter) {
    const paidRange =
      filter.from || filter.to
        ? { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) }
        : undefined;
    const rows = await this.prisma.tip.groupBy({
      by: ["driverId"],
      where: { status: "paid", ...(paidRange ? { paidAt: paidRange } : {}) },
      _sum: { amountCents: true },
      _count: { _all: true },
    });
    const drivers = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.driverId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(drivers.map((d) => [d.id, d.name]));
    return rows
      .map((r) => ({
        driverId: r.driverId,
        driverName: nameById.get(r.driverId) ?? r.driverId,
        totalCents: r._sum.amountCents ?? 0,
        count: r._count._all,
      }))
      .sort((a, b) => b.totalCents - a.totalCents);
  }
}
