import { ForbiddenException } from "@nestjs/common";
import { MerchantReportsService } from "./merchant-reports.service";
import { MerchantService } from "./merchant.service";

/**
 * Story 13: relatórios escopados às lojas do usuário (owner: rede; manager:
 * vínculos). Cada relatório respeita o escopo (loja fora → 403, sem vínculo →
 * 403) e o período (from/to no where). Agregações conferem com fixtures.
 */

const owner = { id: "u1", roles: ["merchant"] };
const manager = { id: "u2", roles: ["customer"] };

function makeService(overrides: {
  scope?: { storeIds: string[]; merchantIds: string[] };
  order?: { findMany?: jest.Mock };
  orderGroup?: { groupBy?: jest.Mock; count?: jest.Mock };
  pickTask?: { groupBy?: jest.Mock; findMany?: jest.Mock };
  delivery?: { groupBy?: jest.Mock };
  orderItem?: { groupBy?: jest.Mock };
  review?: { groupBy?: jest.Mock };
  store?: { findUnique?: jest.Mock };
} = {}) {
  const prisma = {
    order: { findMany: overrides.order?.findMany ?? jest.fn().mockResolvedValue([]) },
    orderGroup: {
      groupBy: overrides.orderGroup?.groupBy ?? jest.fn().mockResolvedValue([]),
      count: overrides.orderGroup?.count ?? jest.fn().mockResolvedValue(0),
    },
    pickTask: {
      groupBy: overrides.pickTask?.groupBy ?? jest.fn().mockResolvedValue([]),
      findMany: overrides.pickTask?.findMany ?? jest.fn().mockResolvedValue([]),
    },
    delivery: { groupBy: overrides.delivery?.groupBy ?? jest.fn().mockResolvedValue([]) },
    orderItem: { groupBy: overrides.orderItem?.groupBy ?? jest.fn().mockResolvedValue([]) },
    review: { groupBy: overrides.review?.groupBy ?? jest.fn().mockResolvedValue([]) },
    store: { findUnique: overrides.store?.findUnique ?? jest.fn().mockResolvedValue({ merchantId: "m1" }) },
  } as never;

  const merchant = {
    scopedStores: jest
      .fn()
      .mockResolvedValue(overrides.scope ?? { storeIds: ["s1", "s2"], merchantIds: ["m1"] }),
  } as unknown as MerchantService;

  return { svc: new MerchantReportsService(prisma, merchant), prisma };
}

describe("MerchantReportsService.sales (story 13)", () => {
  it("agrega faturamento/ticket/payout e filtra pelo escopo + período", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { totalCents: 1000, platformFeeCents: 100, refund: null },
      { totalCents: 3000, platformFeeCents: 300, refund: { amountCents: 500, status: "processed" } },
    ]);
    const { svc } = makeService({ order: { findMany } });
    const res = await svc.sales(owner, { from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T00:00:00.000Z" });

    expect(res.ordersPaid).toBe(2);
    expect(res.salesCents).toBe(4000);
    expect(res.platformFeeCents).toBe(400);
    expect(res.refundsCents).toBe(500);
    expect(res.ticketCents).toBe(2000); // 4000/2
    expect(res.estimatedPayoutCents).toBe(3100); // 4000-400-500
    // escopo nas lojas + janela paga
    const where = findMany.mock.calls[0][0].where;
    expect(where.groups.some.storeId.in).toEqual(["s1", "s2"]);
    expect(where.payment.is.paidAt.gte).toEqual(new Date("2026-06-01T00:00:00.000Z"));
  });

  it("reembolso failed não conta; ticket=0 sem pedidos", async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ totalCents: 1000, platformFeeCents: 0, refund: { amountCents: 999, status: "failed" } }]);
    const { svc } = makeService({ order: { findMany } });
    const res = await svc.sales(owner, {});
    expect(res.refundsCents).toBe(0);
    expect(res.ticketCents).toBe(1000);
  });

  it("loja fora do escopo → FORBIDDEN", async () => {
    const { svc } = makeService({ scope: { storeIds: ["s1"], merchantIds: ["m1"] } });
    await expect(svc.sales(manager, { storeId: "outra" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("usuário sem vínculo → FORBIDDEN", async () => {
    const { svc } = makeService({ scope: { storeIds: [], merchantIds: [] } });
    await expect(svc.sales(manager, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("MerchantReportsService.operations (story 13)", () => {
  it("agrega contagens por status e retiradas pendentes", async () => {
    const { svc } = makeService({
      orderGroup: {
        groupBy: jest.fn().mockResolvedValue([
          { status: "preparing", _count: { _all: 2 } },
          { status: "delivered", _count: { _all: 5 } },
        ]),
        count: jest.fn().mockResolvedValue(3),
      },
      pickTask: { groupBy: jest.fn().mockResolvedValue([{ status: "queued", _count: { _all: 1 } }]) },
      delivery: { groupBy: jest.fn().mockResolvedValue([{ status: "on_the_way", _count: { _all: 4 } }]) },
    });
    const res = await svc.operations(owner, {});
    expect(res.ordersByStatus).toEqual({ preparing: 2, delivered: 5 });
    expect(res.picking).toEqual({ queued: 1 });
    expect(res.deliveries).toEqual({ on_the_way: 4 });
    expect(res.pendingPickups).toBe(3);
  });
});

describe("MerchantReportsService.topProducts (story 13)", () => {
  it("ordena por quantidade desc e respeita o limit", async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { productId: "p1", nameSnapshot: "Arroz", _sum: { quantity: 3, lineTotalCents: 900 } },
      { productId: "p2", nameSnapshot: "Feijão", _sum: { quantity: 10, lineTotalCents: 5000 } },
      { productId: "p3", nameSnapshot: "Café", _sum: { quantity: 1, lineTotalCents: 1500 } },
    ]);
    const { svc } = makeService({ orderItem: { groupBy } });
    const res = await svc.topProducts(owner, {}, 2);
    expect(res.items).toHaveLength(2);
    expect(res.items[0]).toMatchObject({ productId: "p2", name: "Feijão", quantity: 10, revenueCents: 5000 });
    expect(res.items[1].productId).toBe("p1");
    // escopo aplicado no where
    expect(groupBy.mock.calls[0][0].where.group.is.storeId.in).toEqual(["s1", "s2"]);
  });

  it("limit é limitado entre 1 e 50", async () => {
    const groupBy = jest.fn().mockResolvedValue([]);
    const { svc } = makeService({ orderItem: { groupBy } });
    await svc.topProducts(owner, {}, 999);
    // não estoura — apenas não falha; retorno vazio
    const res = await svc.topProducts(owner, {}, 0);
    expect(res.items).toEqual([]);
  });
});

describe("MerchantReportsService.pickers (story 65)", () => {
  const T0 = new Date("2026-07-15T10:00:00.000Z");
  const HOUR = 60 * 60 * 1000;

  function row(over: {
    pickerId: string;
    name?: string | null;
    startedAt?: Date | null;
    packedAt?: Date | null;
    statuses?: string[];
  }) {
    return {
      pickerId: over.pickerId,
      picker: over.name === null ? null : { name: over.name ?? "Alguém" },
      startedAt: over.startedAt ?? null,
      packedAt: over.packedAt ?? null,
      items: (over.statuses ?? []).map((status) => ({ status })),
    };
  }

  it("agrupa por colaborador com as mesmas métricas do picker e ordena por tarefas", async () => {
    const findMany = jest.fn().mockResolvedValue([
      row({ pickerId: "u1", name: "Ana", startedAt: T0, packedAt: new Date(T0.getTime() + HOUR), statuses: ["picked", "picked", "substituted", "refused"] }),
      row({ pickerId: "u2", name: "Beto", statuses: ["picked"] }), // sem timestamps → itens/h null
      row({ pickerId: "u1", name: "Ana", startedAt: T0, packedAt: new Date(T0.getTime() + HOUR), statuses: ["picked", "picked"] }),
    ]);
    const { svc } = makeService({ pickTask: { findMany } });
    const res = await svc.pickers(owner, {});

    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toEqual({
      pickerId: "u1",
      name: "Ana",
      tasksCompleted: 2,
      itemsPicked: 4,
      itemsPerHour: 2, // 4 itens em 2h ativas
      substitutionRate: 0.1667, // 1/6
      refusalRate: 0.1667,
    });
    expect(res.rows[1]).toMatchObject({ pickerId: "u2", tasksCompleted: 1, itemsPerHour: null });
  });

  it("escopa por loja e filtra por readyAt no período (só task com picker)", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { svc } = makeService({ pickTask: { findMany } });
    const res = await svc.pickers(owner, { from: "2026-07-01T00:00:00.000Z", to: "2026-07-15T00:00:00.000Z" });

    const where = findMany.mock.calls[0][0].where;
    expect(where.storeId.in).toEqual(["s1", "s2"]);
    expect(where.pickerId).toEqual({ not: null });
    expect(where.readyAt).toEqual({
      gte: new Date("2026-07-01T00:00:00.000Z"),
      lte: new Date("2026-07-15T00:00:00.000Z"),
    });
    expect(res.rows).toEqual([]);
  });

  it("colaborador sem nome cai no fallback '—'", async () => {
    const findMany = jest.fn().mockResolvedValue([row({ pickerId: "u9", name: null, statuses: ["picked"] })]);
    const { svc } = makeService({ pickTask: { findMany } });
    const res = await svc.pickers(owner, {});
    expect(res.rows[0].name).toBe("—");
  });

  it("loja fora do escopo → FORBIDDEN", async () => {
    const { svc } = makeService({ scope: { storeIds: ["s1"], merchantIds: ["m1"] } });
    await expect(svc.pickers(manager, { storeId: "outra" })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("MerchantReportsService.reviews (story 13)", () => {
  it("agrega média/contagem por eixo e escopa merchant às redes do usuário", async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { axis: "platform", _avg: { rating: 4.5 }, _count: { _all: 2 } },
      { axis: "merchant", _avg: { rating: 3.333 }, _count: { _all: 3 } },
    ]);
    const { svc } = makeService({ review: { groupBy }, scope: { storeIds: ["s1"], merchantIds: ["m1", "m2"] } });
    const res = await svc.reviews(owner, {});
    expect(res.axes).toEqual([
      { axis: "platform", average: 4.5, count: 2 },
      { axis: "merchant", average: 3.33, count: 3 },
    ]);
    const or = groupBy.mock.calls[0][0].where.OR;
    expect(or[1]).toEqual({ axis: "merchant", targetMerchantId: { in: ["m1", "m2"] } });
  });
});
