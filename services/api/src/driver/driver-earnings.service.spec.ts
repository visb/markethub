import { DriverService, earningsPeriodStart } from "./driver.service";

/**
 * Story 60 + 77 — ganhos (gorjetas) e histórico do entregador. Desde a story 77 a
 * gorjeta do entregador é um TipItem (target=driver) e a agregação passa a somar os
 * itens do próprio driver com status/data herdados do Tip. Testa: item pago soma,
 * pendente aparece separado, filtro por alvo/driver/período; e o histórico: paginação
 * (hasMore), só delivered/canceled e gorjeta anexada. Prisma mockado — sem rede/DB.
 */

type TipAggArgs = { where: { tip?: { status?: string } } & Record<string, unknown> };

function makePrisma(over: {
  paidSum?: number | null;
  paidCount?: number;
  pendingSum?: number | null;
  deliveredCount?: number;
  historyRows?: unknown[];
} = {}) {
  const tipItemAggregate = jest.fn((args: TipAggArgs) => {
    const status = args.where.tip?.status;
    if (status === "paid") {
      return Promise.resolve({ _sum: { amountCents: over.paidSum ?? 0 }, _count: { _all: over.paidCount ?? 0 } });
    }
    return Promise.resolve({ _sum: { amountCents: over.pendingSum ?? 0 } });
  });
  const deliveryCount = jest.fn().mockResolvedValue(over.deliveredCount ?? 0);
  const deliveryFindMany = jest.fn().mockResolvedValue(over.historyRows ?? []);
  const prisma = {
    tipItem: { aggregate: tipItemAggregate },
    delivery: { count: deliveryCount, findMany: deliveryFindMany },
  } as never;
  return { prisma, tipItemAggregate, deliveryCount, deliveryFindMany };
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

  it("soma só o item driver do próprio entregador com Tip pago no período", async () => {
    const { prisma, tipItemAggregate } = makePrisma();
    const svc = makeService(prisma);
    await svc.earnings("drv1", "30d");
    const paidCall = tipItemAggregate.mock.calls.find((c) => c[0].where.tip?.status === "paid");
    const where = paidCall![0].where as {
      target: string;
      targetDriverId: string;
      tip: { status: string; paidAt: { gte: Date } };
    };
    expect(where.target).toBe("driver");
    expect(where.targetDriverId).toBe("drv1");
    expect(where.tip.status).toBe("paid");
    expect(where.tip.paidAt.gte).toBeInstanceOf(Date);
  });

  it("pendente filtra o item driver por Tip pendente e createdAt (não soma no pago)", async () => {
    const { prisma, tipItemAggregate } = makePrisma();
    const svc = makeService(prisma);
    await svc.earnings("drv1", "7d");
    const pendingCall = tipItemAggregate.mock.calls.find((c) => c[0].where.tip?.status === "pending");
    const where = pendingCall![0].where as {
      target: string;
      targetDriverId: string;
      tip: { status: string; createdAt: { gte: Date } };
    };
    expect(where.target).toBe("driver");
    expect(where.targetDriverId).toBe("drv1");
    expect(where.tip.status).toBe("pending");
    expect(where.tip.createdAt.gte).toBeInstanceOf(Date);
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
        tip: { status: "paid", items: [{ amountCents: 500, targetDriverId: "drv1" }] },
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
    expect(args.where).toMatchObject({ driverId: "drv1", status: { in: ["delivered", "canceled"] } });
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

  it("não anexa gorjeta quando o item driver é de outro entregador (multi-loja)", async () => {
    const row = mkRow({
      orderGroup: {
        orderId: "o1",
        store: { name: "Loja" },
        order: {
          addressSnapshot: null,
          tip: { status: "paid", items: [{ amountCents: 500, targetDriverId: "outro" }] },
        },
      },
    });
    const { prisma } = makePrisma({ historyRows: [row] });
    const svc = makeService(prisma);
    const out = await svc.deliveryHistory("drv1");
    expect(out.items[0].tip).toBeUndefined();
    expect(out.items[0].destinationArea).toBeUndefined();
  });

  it("anexa a gorjeta legada/backfill (item driver deste entregador)", async () => {
    const row = mkRow({
      orderGroup: {
        orderId: "o2",
        store: { name: "Loja" },
        order: {
          addressSnapshot: null,
          tip: { status: "paid", items: [{ amountCents: 300, targetDriverId: "drv1" }] },
        },
      },
    });
    const { prisma } = makePrisma({ historyRows: [row] });
    const svc = makeService(prisma);
    const out = await svc.deliveryHistory("drv1");
    expect(out.items[0].tip).toEqual({ amountCents: 300, status: "paid" });
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

describe("DriverService.deliveryHistory — recorte por período (story 79)", () => {
  /** Extrai o `OR` do where para inspecionar a janela de recorte. */
  function whereOr(deliveryFindMany: jest.Mock) {
    return deliveryFindMany.mock.calls[0][0].where.OR as [
      { status: string; deliveredAt: { gte: Date } },
      { status: string; updatedAt: { gte: Date } },
    ];
  }

  it("default 30d quando o período é omitido: recorta entregue por deliveredAt e cancelada por updatedAt", async () => {
    const now = new Date();
    const { prisma, deliveryFindMany } = makePrisma({ historyRows: [] });
    const svc = makeService(prisma);
    await svc.deliveryHistory("drv1");
    const or = whereOr(deliveryFindMany);
    expect(or[0]).toMatchObject({ status: "delivered" });
    expect(or[1]).toMatchObject({ status: "canceled" });
    // 30d ≈ agora − 30 dias (tolerância de 1min p/ o tempo de execução do teste)
    const expected = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(or[0].deliveredAt.gte.getTime() - expected)).toBeLessThan(60_000);
    expect(or[1].updatedAt.gte.getTime()).toBe(or[0].deliveredAt.gte.getTime());
  });

  it("period=today corta em 00:00 do servidor (mesma janela dos cards)", async () => {
    const { prisma, deliveryFindMany } = makePrisma({ historyRows: [] });
    const svc = makeService(prisma);
    await svc.deliveryHistory("drv1", 1, "today");
    const or = whereOr(deliveryFindMany);
    const start = or[0].deliveredAt.gte;
    const expected = new Date();
    expected.setHours(0, 0, 0, 0);
    expect(start.getTime()).toBe(expected.getTime());
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it("period=7d recorta entregue e cancelada por agora − 7 dias", async () => {
    const now = Date.now();
    const { prisma, deliveryFindMany } = makePrisma({ historyRows: [] });
    const svc = makeService(prisma);
    await svc.deliveryHistory("drv1", 1, "7d");
    const or = whereOr(deliveryFindMany);
    const expected = now - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(or[0].deliveredAt.gte.getTime() - expected)).toBeLessThan(60_000);
    expect(or[1].updatedAt.gte.getTime()).toBe(or[0].deliveredAt.gte.getTime());
  });

  it("recorte convive com a paginação: page 2 mantém skip e o OR do período", async () => {
    const { prisma, deliveryFindMany } = makePrisma({ historyRows: [] });
    const svc = makeService(prisma);
    const out = await svc.deliveryHistory("drv1", 2, "7d");
    const args = deliveryFindMany.mock.calls[0][0];
    expect(out.page).toBe(2);
    expect(args.skip).toBe(20);
    expect(args.where.OR).toHaveLength(2);
    expect(args.where.driverId).toBe("drv1");
  });
});
