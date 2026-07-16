import { AdminDashboardService } from "./admin-dashboard.service";

/**
 * Backfill de cobertura (story 28). Prisma é mockado — sem DB. Cobre as
 * agregações do dashboard admin: lista de pedidos (filtros + contagem por
 * status), detalhe, operação (filas/SLA), financeiro e gorjetas por entregador.
 */

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    order: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn(),
    },
    pickTask: {
      groupBy: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    delivery: {
      groupBy: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    orderGroup: { count: jest.fn().mockResolvedValue(0) },
    tip: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null }, _count: { _all: 0 } }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    ...over,
  } as never;
}

describe("AdminDashboardService.orders", () => {
  function orderRow(over: Record<string, unknown> = {}) {
    return {
      id: "o1",
      status: "delivered",
      totalCents: 5000,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      user: { name: "Ana" },
      payment: { status: "paid" },
      refund: null,
      groups: [{ store: { name: "Loja A" }, fulfillment: "delivery", status: "delivered" }],
      ...over,
    };
  }

  it("mapeia itens, contagem por status e paginação default", async () => {
    const prisma = makePrisma({
      order: {
        findMany: jest.fn().mockResolvedValue([orderRow()]),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([{ status: "delivered", _count: { _all: 1 } }]),
      },
    });
    const out = await new AdminDashboardService(prisma).orders({});
    expect(out).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
      statusCounts: { delivered: 1 },
    });
    expect(out.items[0]).toMatchObject({
      id: "o1",
      customer: "Ana",
      paymentStatus: "paid",
      refundCents: 0,
      stores: ["Loja A"],
      fulfillments: ["delivery"],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("conta reembolso não-falho e ignora reembolso failed", async () => {
    const prisma = makePrisma({
      order: {
        findMany: jest.fn().mockResolvedValue([
          orderRow({ refund: { amountCents: 300, status: "succeeded" } }),
          orderRow({ id: "o2", refund: { amountCents: 999, status: "failed" } }),
        ]),
        count: jest.fn().mockResolvedValue(2),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });
    const out = await new AdminDashboardService(prisma).orders({});
    expect(out.items[0].refundCents).toBe(300);
    expect(out.items[1].refundCents).toBe(0);
  });

  it("payment null vira paymentStatus null", async () => {
    const prisma = makePrisma({
      order: {
        findMany: jest.fn().mockResolvedValue([orderRow({ payment: null })]),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });
    const out = await new AdminDashboardService(prisma).orders({});
    expect(out.items[0].paymentStatus).toBeNull();
  });

  it("aplica filtros de status/loja/período e clampa paginação", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const groupBy = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({ order: { findMany, count, groupBy } });
    const out = await new AdminDashboardService(prisma).orders({
      status: "delivered" as never,
      storeId: "s1",
      from: new Date("2026-01-01"),
      to: new Date("2026-02-01"),
      page: 0,
      pageSize: 500,
    });
    // page clamped to 1, pageSize clamped to 100
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(100);
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toBe("delivered");
    expect(where.groups).toEqual({ some: { storeId: "s1" } });
    expect(where.createdAt).toEqual({
      gte: new Date("2026-01-01"),
      lte: new Date("2026-02-01"),
    });
    expect(findMany.mock.calls[0][0].skip).toBe(0);
    expect(findMany.mock.calls[0][0].take).toBe(100);
  });

  it("busca `q` (story 67): id exato OU nome/e-mail contains insensitive", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      order: { findMany, count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    });
    await new AdminDashboardService(prisma).orders({ q: "ana@ex.com" });
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { id: "ana@ex.com" },
      { user: { is: { name: { contains: "ana@ex.com", mode: "insensitive" } } } },
      { user: { is: { email: { contains: "ana@ex.com", mode: "insensitive" } } } },
    ]);
  });

  it("sem `q` não monta OR de busca", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      order: { findMany, count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    });
    await new AdminDashboardService(prisma).orders({});
    expect(findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});

describe("AdminDashboardService.orderDetail", () => {
  it("delega ao findUniqueOrThrow com o id", () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "o1" });
    const prisma = makePrisma({ order: { findUniqueOrThrow } });
    new AdminDashboardService(prisma).orderDetail("o1");
    expect(findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1" } }),
    );
  });
});

describe("AdminDashboardService.operations", () => {
  it("agrega filas e calcula SLA em minutos", async () => {
    const now = Date.now();
    const prisma = makePrisma({
      pickTask: {
        groupBy: jest.fn().mockResolvedValue([{ status: "queued", _count: { _all: 3 } }]),
        findFirst: jest.fn().mockResolvedValue({ createdAt: new Date(now - 30 * 60000) }),
      },
      delivery: {
        groupBy: jest.fn().mockResolvedValue([{ status: "unassigned", _count: { _all: 2 } }]),
        findFirst: jest.fn().mockResolvedValue({ createdAt: new Date(now - 10 * 60000) }),
      },
      orderGroup: { count: jest.fn().mockResolvedValue(4) },
    });
    const out = await new AdminDashboardService(prisma).operations();
    expect(out).toMatchObject({
      picking: { queued: 3 },
      deliveries: { unassigned: 2 },
      pendingPickups: 4,
    });
    expect(out.sla.oldestQueuedPickMin).toBe(30);
    expect(out.sla.oldestUnassignedDeliveryMin).toBe(10);
  });

  it("SLA null quando não há item mais antigo", async () => {
    const out = await new AdminDashboardService(makePrisma()).operations();
    expect(out.sla.oldestQueuedPickMin).toBeNull();
    expect(out.sla.oldestUnassignedDeliveryMin).toBeNull();
  });

  it("filtra por loja quando storeId informado", async () => {
    const pickGroupBy = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      pickTask: { groupBy: pickGroupBy, findFirst: jest.fn().mockResolvedValue(null) },
    });
    await new AdminDashboardService(prisma).operations("s9");
    expect(pickGroupBy.mock.calls[0][0].where).toEqual({ storeId: "s9" });
  });
});

describe("AdminDashboardService.finance", () => {
  it("soma vendas, taxa, reembolsos, gorjetas e repasse estimado", async () => {
    const prisma = makePrisma({
      order: {
        findMany: jest.fn().mockResolvedValue([
          { totalCents: 10000, platformFeeCents: 1000, refund: null },
          {
            totalCents: 5000,
            platformFeeCents: 500,
            refund: { amountCents: 2000, status: "succeeded" },
          },
          {
            totalCents: 3000,
            platformFeeCents: 300,
            refund: { amountCents: 999, status: "failed" },
          },
        ]),
      },
      tip: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amountCents: 1500 }, _count: { _all: 3 } }),
      },
    });
    const out = await new AdminDashboardService(prisma).finance({});
    expect(out).toEqual({
      ordersPaid: 3,
      salesCents: 18000,
      platformFeeCents: 1800,
      refundsCents: 2000,
      tipsCents: 1500,
      tipsCount: 3,
      estimatedMerchantPayoutCents: 18000 - 1800 - 2000,
    });
  });

  it("tipsCents 0 quando aggregate retorna sum null", async () => {
    const out = await new AdminDashboardService(makePrisma()).finance({});
    expect(out.tipsCents).toBe(0);
    expect(out.ordersPaid).toBe(0);
  });

  it("monta where com período pago e loja", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const tipAggregate = jest
      .fn()
      .mockResolvedValue({ _sum: { amountCents: null }, _count: { _all: 0 } });
    const prisma = makePrisma({
      order: { findMany },
      tip: { aggregate: tipAggregate },
    });
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    await new AdminDashboardService(prisma).finance({ from, to, storeId: "s1" });
    const where = findMany.mock.calls[0][0].where;
    expect(where.payment.is).toMatchObject({ status: "paid", paidAt: { gte: from, lte: to } });
    expect(where.groups).toEqual({ some: { storeId: "s1" } });
    expect(tipAggregate.mock.calls[0][0].where.paidAt).toEqual({ gte: from, lte: to });
  });
});

describe("AdminDashboardService.driverTips", () => {
  it("soma gorjetas por entregador, resolve nome e ordena desc", async () => {
    const prisma = makePrisma({
      tip: {
        groupBy: jest.fn().mockResolvedValue([
          { driverId: "d1", _sum: { amountCents: 1000 }, _count: { _all: 2 } },
          { driverId: "d2", _sum: { amountCents: 3000 }, _count: { _all: 1 } },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: "d1", name: "Carlos" }]),
      },
    });
    const out = await new AdminDashboardService(prisma).driverTips({});
    expect(out).toEqual([
      { driverId: "d2", driverName: "d2", totalCents: 3000, count: 1 },
      { driverId: "d1", driverName: "Carlos", totalCents: 1000, count: 2 },
    ]);
  });

  it("totalCents 0 quando sum é null e aplica período", async () => {
    const groupBy = jest
      .fn()
      .mockResolvedValue([{ driverId: "d1", _sum: { amountCents: null }, _count: { _all: 0 } }]);
    const prisma = makePrisma({
      tip: { groupBy },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const from = new Date("2026-03-01");
    const out = await new AdminDashboardService(prisma).driverTips({ from });
    expect(out[0].totalCents).toBe(0);
    expect(groupBy.mock.calls[0][0].where.paidAt).toEqual({ gte: from });
  });
});
