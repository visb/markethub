import { DriverService, earningsPeriodStart } from "./driver.service";

/**
 * Story 60 — ganhos (gorjetas) e histórico do entregador. Testa a agregação:
 * gorjeta paga soma, pendente aparece separada, o período filtra por `paidAt` e o
 * entregador só vê o seu; e o histórico: paginação (hasMore), só delivered/canceled
 * e gorjeta anexada. Prisma mockado — sem rede/DB.
 */

type TipAggArgs = { where: Record<string, unknown> };

function makePrisma(over: {
  paidSum?: number | null;
  paidCount?: number;
  pendingSum?: number | null;
  deliveredCount?: number;
  historyRows?: unknown[];
} = {}) {
  const tipAggregate = jest.fn((args: TipAggArgs) => {
    const status = (args.where as { status?: string }).status;
    if (status === "paid") {
      return Promise.resolve({ _sum: { amountCents: over.paidSum ?? 0 }, _count: { _all: over.paidCount ?? 0 } });
    }
    return Promise.resolve({ _sum: { amountCents: over.pendingSum ?? 0 } });
  });
  const deliveryCount = jest.fn().mockResolvedValue(over.deliveredCount ?? 0);
  const deliveryFindMany = jest.fn().mockResolvedValue(over.historyRows ?? []);
  const prisma = {
    tip: { aggregate: tipAggregate },
    delivery: { count: deliveryCount, findMany: deliveryFindMany },
  } as never;
  return { prisma, tipAggregate, deliveryCount, deliveryFindMany };
}

function makeService(prisma: unknown) {
  return new DriverService(prisma as never, {} as never, {} as never, { publish: jest.fn() } as never);
}

describe("earningsPeriodStart", () => {
  it("today: zera hora/min/seg do dia corrente", () => {
    const now = new Date("2026-07-11T15:30:45.000Z");
    const start = earningsPeriodStart("today", now);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
  });

  it("7d/30d: subtrai N dias de agora", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    expect(earningsPeriodStart("7d", now).toISOString()).toBe("2026-07-24T12:00:00.000Z");
    expect(earningsPeriodStart("30d", now).toISOString()).toBe("2026-07-01T12:00:00.000Z");
  });
});

describe("DriverService.earnings", () => {
  it("soma as gorjetas pagas e conta as entregas concluídas", async () => {
    const { prisma } = makePrisma({ paidSum: 1500, paidCount: 3, pendingSum: 400, deliveredCount: 5 });
    const svc = makeService(prisma);
    const out = await svc.earnings("drv1", "7d");
    expect(out).toEqual({
      period: "7d",
      tipsPaidCents: 1500,
      tipsPaidCount: 3,
      tipsPendingCents: 400,
      deliveriesCompleted: 5,
    });
  });

  it("pending aparece separada e não entra no pago (soma zero → 0)", async () => {
    const { prisma } = makePrisma({ paidSum: null, paidCount: 0, pendingSum: 700 });
    const svc = makeService(prisma);
    const out = await svc.earnings("drv1", "today");
    expect(out.tipsPaidCents).toBe(0);
    expect(out.tipsPendingCents).toBe(700);
  });

  it("filtra as gorjetas pagas por driverId e paidAt no período", async () => {
    const { prisma, tipAggregate } = makePrisma();
    const svc = makeService(prisma);
    await svc.earnings("drv1", "30d");
    const paidCall = tipAggregate.mock.calls.find((c) => (c[0].where as { status?: string }).status === "paid");
    const where = paidCall![0].where as { driverId: string; status: string; paidAt: { gte: Date } };
    expect(where.driverId).toBe("drv1");
    expect(where.status).toBe("paid");
    expect(where.paidAt.gte).toBeInstanceOf(Date);
  });

  it("as entregas concluídas contam só delivered do próprio driver no período", async () => {
    const { prisma, deliveryCount } = makePrisma({ deliveredCount: 2 });
    const svc = makeService(prisma);
    await svc.earnings("drv1", "today");
    const where = deliveryCount.mock.calls[0][0].where as {
      driverId: string;
      status: string;
      deliveredAt: { gte: Date };
    };
    expect(where.driverId).toBe("drv1");
    expect(where.status).toBe("delivered");
    expect(where.deliveredAt.gte).toBeInstanceOf(Date);
  });
});

function mkRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "d1",
    status: "delivered",
    deliveredAt: new Date("2026-07-10T10:00:00.000Z"),
    updatedAt: new Date("2026-07-10T10:00:00.000Z"),
    orderGroup: {
      orderId: "o1",
      store: { name: "Loja" },
      order: {
        addressSnapshot: { district: "Centro", city: "Sampa" },
        tip: { amountCents: 500, status: "paid", driverId: "drv1" },
      },
    },
    ...over,
  };
}

describe("DriverService.deliveryHistory", () => {
  it("retorna só delivered/canceled do driver, desc por data", async () => {
    const { prisma, deliveryFindMany } = makePrisma({ historyRows: [mkRow()] });
    const svc = makeService(prisma);
    const out = await svc.deliveryHistory("drv1");
    const args = deliveryFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ driverId: "drv1", status: { in: ["delivered", "canceled"] } });
    expect(args.orderBy).toEqual({ updatedAt: "desc" });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({
      id: "d1",
      orderId: "o1",
      status: "delivered",
      storeName: "Loja",
      destinationArea: "Centro, Sampa",
      tip: { amountCents: 500, status: "paid" },
    });
  });

  it("hasMore=true quando vem pageSize+1 linhas; corta a última", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => mkRow({ id: `d${i}` }));
    const { prisma } = makePrisma({ historyRows: rows });
    const svc = makeService(prisma);
    const out = await svc.deliveryHistory("drv1", 1);
    expect(out.items).toHaveLength(20);
    expect(out.hasMore).toBe(true);
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(20);
  });

  it("hasMore=false quando vem <= pageSize", async () => {
    const { prisma } = makePrisma({ historyRows: [mkRow(), mkRow({ id: "d2" })] });
    const svc = makeService(prisma);
    const out = await svc.deliveryHistory("drv1");
    expect(out.hasMore).toBe(false);
  });

  it("pagina via skip: página 2 pula pageSize linhas", async () => {
    const { prisma, deliveryFindMany } = makePrisma({ historyRows: [] });
    const svc = makeService(prisma);
    await svc.deliveryHistory("drv1", 2);
    expect(deliveryFindMany.mock.calls[0][0].skip).toBe(20);
  });

  it("page inválida (0/NaN) cai para 1 (skip 0)", async () => {
    const { prisma, deliveryFindMany } = makePrisma({ historyRows: [] });
    const svc = makeService(prisma);
    const out = await svc.deliveryHistory("drv1", 0);
    expect(out.page).toBe(1);
    expect(deliveryFindMany.mock.calls[0][0].skip).toBe(0);
  });

  it("não anexa gorjeta de outro entregador (pedido multi-loja)", async () => {
    const row = mkRow({
      orderGroup: {
        orderId: "o1",
        store: { name: "Loja" },
        order: { addressSnapshot: null, tip: { amountCents: 500, status: "paid", driverId: "outro" } },
      },
    });
    const { prisma } = makePrisma({ historyRows: [row] });
    const svc = makeService(prisma);
    const out = await svc.deliveryHistory("drv1");
    expect(out.items[0].tip).toBeUndefined();
    expect(out.items[0].destinationArea).toBeUndefined();
  });

  it("tolera loja/pedido ausentes no include (defensivo)", async () => {
    const row = mkRow({
      orderGroup: { orderId: "o9", store: null, order: null },
    });
    const { prisma } = makePrisma({ historyRows: [row] });
    const svc = makeService(prisma);
    const out = await svc.deliveryHistory("drv1");
    expect(out.items[0].storeName).toBe("");
    expect(out.items[0].destinationArea).toBeUndefined();
    expect(out.items[0].tip).toBeUndefined();
  });

  it("cancelada sem deliveredAt usa updatedAt como data", async () => {
    const row = mkRow({ status: "canceled", deliveredAt: null, updatedAt: new Date("2026-07-09T08:00:00.000Z") });
    const { prisma } = makePrisma({ historyRows: [row] });
    const svc = makeService(prisma);
    const out = await svc.deliveryHistory("drv1");
    expect(out.items[0].status).toBe("canceled");
    expect(out.items[0].date).toBe("2026-07-09T08:00:00.000Z");
  });
});
