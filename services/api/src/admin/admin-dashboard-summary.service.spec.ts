import {
  AdminDashboardSummaryService,
  ERP_SYNC_STALE_HOURS,
  OUTBOX_BACKLOG_THRESHOLD_MIN,
  QUEUE_AGE_THRESHOLD_MIN,
} from "./admin-dashboard-summary.service";
import type { AdminDashboardService } from "./admin-dashboard.service";

/**
 * Agregador do dashboard admin (story 66). Prisma e o financeiro são mockados —
 * sem DB. Cobre: janelas hoje/ontem com borda de meia-noite em America/Sao_Paulo,
 * deltas (inclusive divisor zero), filas acima do limiar e cada alerta
 * disparando/não-disparando no threshold.
 */

const financeZero = {
  ordersPaid: 0,
  salesCents: 0,
  platformFeeCents: 0,
  refundsCents: 0,
  tipsCents: 0,
  tipsCount: 0,
  estimatedMerchantPayoutCents: 0,
};

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    store: { count: jest.fn().mockResolvedValue(0) },
    pickTask: { count: jest.fn().mockResolvedValue(0) },
    delivery: { count: jest.fn().mockResolvedValue(0) },
    orderGroup: { count: jest.fn().mockResolvedValue(0) },
    outboxEvent: { count: jest.fn().mockResolvedValue(0) },
    payment: { count: jest.fn().mockResolvedValue(0) },
    merchant: { findMany: jest.fn().mockResolvedValue([]) },
    syncRun: { findFirst: jest.fn().mockResolvedValue(null) },
    ...over,
  } as never;
}

function makeDashboard(
  today: Partial<typeof financeZero> = {},
  yesterday: Partial<typeof financeZero> = {},
) {
  const finance = jest
    .fn()
    .mockResolvedValueOnce({ ...financeZero, ...today })
    .mockResolvedValueOnce({ ...financeZero, ...yesterday });
  return { finance } as unknown as AdminDashboardService & { finance: jest.Mock };
}

// 14:00Z = 11:00 em São Paulo (UTC-3, sem horário de verão desde 2019)
const NOW = new Date("2026-07-16T14:00:00.000Z");
const TODAY_START = new Date("2026-07-16T03:00:00.000Z");

describe("AdminDashboardSummaryService — KPIs", () => {
  it("consulta hoje e ontem com borda de meia-noite em America/Sao_Paulo", async () => {
    const dashboard = makeDashboard();
    await new AdminDashboardSummaryService(makePrisma(), dashboard).summary(NOW);

    expect(dashboard.finance).toHaveBeenNthCalledWith(1, { from: TODAY_START, to: NOW });
    expect(dashboard.finance).toHaveBeenNthCalledWith(2, {
      from: new Date("2026-07-15T03:00:00.000Z"),
      to: new Date(TODAY_START.getTime() - 1),
    });
  });

  it("antes das 3h UTC ainda é 'ontem' em SP (23:59 local)", async () => {
    const dashboard = makeDashboard();
    // 02:59Z de 16/07 = 23:59 de 15/07 em SP → "hoje" começa em 15/07T03:00Z
    await new AdminDashboardSummaryService(makePrisma(), dashboard).summary(
      new Date("2026-07-16T02:59:00.000Z"),
    );
    expect(dashboard.finance.mock.calls[0][0].from).toEqual(
      new Date("2026-07-15T03:00:00.000Z"),
    );
  });

  it("calcula deltas % e ticket médio", async () => {
    const dashboard = makeDashboard(
      { ordersPaid: 12, salesCents: 60000 },
      { ordersPaid: 10, salesCents: 40000 },
    );
    const out = await new AdminDashboardSummaryService(makePrisma(), dashboard).summary(NOW);
    expect(out.kpis).toMatchObject({
      ordersPaidToday: 12,
      ordersPaidDeltaPct: 20,
      gmvTodayCents: 60000,
      gmvDeltaPct: 50,
      avgTicketCents: 5000,
    });
  });

  it("delta null quando ontem foi zero e ticket 0 sem pedidos hoje", async () => {
    const out = await new AdminDashboardSummaryService(makePrisma(), makeDashboard()).summary(NOW);
    expect(out.kpis.ordersPaidDeltaPct).toBeNull();
    expect(out.kpis.gmvDeltaPct).toBeNull();
    expect(out.kpis.avgTicketCents).toBe(0);
  });

  it("delta negativo quando hoje caiu vs ontem", async () => {
    const dashboard = makeDashboard(
      { ordersPaid: 5, salesCents: 10000 },
      { ordersPaid: 10, salesCents: 40000 },
    );
    const out = await new AdminDashboardSummaryService(makePrisma(), dashboard).summary(NOW);
    expect(out.kpis.ordersPaidDeltaPct).toBe(-50);
    expect(out.kpis.gmvDeltaPct).toBe(-75);
  });

  it("conta lojas ativas e pausadas separadamente (story 57)", async () => {
    const storeCount = jest
      .fn()
      .mockImplementation(({ where }: { where: { pausedAt: null | { not: null } } }) =>
        Promise.resolve(where.pausedAt === null ? 7 : 2),
      );
    const prisma = makePrisma({ store: { count: storeCount } });
    const out = await new AdminDashboardSummaryService(prisma, makeDashboard()).summary(NOW);
    expect(out.kpis.activeStores).toBe(7);
    expect(out.kpis.pausedStores).toBe(2);
    expect(storeCount).toHaveBeenCalledWith({ where: { active: true, pausedAt: null } });
    expect(storeCount).toHaveBeenCalledWith({ where: { active: true, pausedAt: { not: null } } });
  });
});

describe("AdminDashboardSummaryService — filas", () => {
  it("conta só itens acima do limiar de idade (15 min) e agrega retiradas/falhas", async () => {
    const pickCount = jest.fn().mockResolvedValue(3);
    const deliveryCount = jest
      .fn()
      .mockImplementation(({ where }: { where: { status: string } }) =>
        Promise.resolve(where.status === "unassigned" ? 2 : 1),
      );
    const groupCount = jest.fn().mockResolvedValue(4);
    const prisma = makePrisma({
      pickTask: { count: pickCount },
      delivery: { count: deliveryCount },
      orderGroup: { count: groupCount },
    });

    const out = await new AdminDashboardSummaryService(prisma, makeDashboard()).summary(NOW);
    expect(out.queues).toEqual({
      pickingQueuedOver15Min: 3,
      deliveriesUnassignedOver15Min: 2,
      pickupsAwaiting: 4,
      deliveriesFailedAwaitingDecision: 1,
    });

    const ageLimit = new Date(NOW.getTime() - QUEUE_AGE_THRESHOLD_MIN * 60_000);
    expect(pickCount).toHaveBeenCalledWith({
      where: { status: "queued", createdAt: { lt: ageLimit } },
    });
    expect(deliveryCount).toHaveBeenCalledWith({
      where: { status: "unassigned", createdAt: { lt: ageLimit } },
    });
    expect(deliveryCount).toHaveBeenCalledWith({ where: { status: "failed" } });
    expect(groupCount).toHaveBeenCalledWith({
      where: { fulfillment: "pickup", status: "ready_for_pickup" },
    });
  });
});

describe("AdminDashboardSummaryService — alertas", () => {
  it("sem anomalia → alerts vazio ('tudo em ordem')", async () => {
    const out = await new AdminDashboardSummaryService(makePrisma(), makeDashboard()).summary(NOW);
    expect(out.alerts).toEqual([]);
  });

  it("OUTBOX_BACKLOG dispara com eventos sem publishedAt além de 5 min", async () => {
    const outboxCount = jest.fn().mockResolvedValue(3);
    const prisma = makePrisma({ outboxEvent: { count: outboxCount } });
    const out = await new AdminDashboardSummaryService(prisma, makeDashboard()).summary(NOW);
    expect(out.alerts).toEqual([
      expect.objectContaining({ severity: "critical", code: "OUTBOX_BACKLOG", count: 3 }),
    ]);
    expect(outboxCount).toHaveBeenCalledWith({
      where: {
        publishedAt: null,
        createdAt: { lt: new Date(NOW.getTime() - OUTBOX_BACKLOG_THRESHOLD_MIN * 60_000) },
      },
    });
  });

  it("PAYMENTS_STUCK dispara com PIX pending além da janela (expiresAt < agora)", async () => {
    const paymentCount = jest.fn().mockResolvedValue(2);
    const prisma = makePrisma({ payment: { count: paymentCount } });
    const out = await new AdminDashboardSummaryService(prisma, makeDashboard()).summary(NOW);
    expect(out.alerts).toEqual([
      expect.objectContaining({ severity: "critical", code: "PAYMENTS_STUCK", count: 2 }),
    ]);
    expect(paymentCount).toHaveBeenCalledWith({
      where: { status: "pending", expiresAt: { lt: NOW } },
    });
  });

  it("ERP_SYNC_STALE: merchant sem run nunca e último run failed contam; run recente ok não", async () => {
    const merchants = [
      { id: "m1", stores: [{ id: "s1" }] }, // nunca rodou → stale
      { id: "m2", stores: [{ id: "s2" }, { id: "s3" }] }, // último failed → stale
      { id: "m3", stores: [{ id: "s4" }] }, // completed recente → ok
    ];
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: "failed", startedAt: new Date(NOW.getTime() - 3_600_000) })
      .mockResolvedValueOnce({
        status: "completed",
        startedAt: new Date(NOW.getTime() - 3_600_000),
      });
    const prisma = makePrisma({
      merchant: { findMany: jest.fn().mockResolvedValue(merchants) },
      syncRun: { findFirst },
    });
    const out = await new AdminDashboardSummaryService(prisma, makeDashboard()).summary(NOW);
    expect(out.alerts).toEqual([
      expect.objectContaining({ severity: "warning", code: "ERP_SYNC_STALE", count: 2 }),
    ]);
    // último run da rede = mais recente entre as lojas dela
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: { in: ["s2", "s3"] } },
        orderBy: { startedAt: "desc" },
      }),
    );
  });

  it("ERP_SYNC_STALE dispara com run ok porém mais velho que 24h; recente não dispara", async () => {
    const staleRun = {
      status: "completed",
      startedAt: new Date(NOW.getTime() - (ERP_SYNC_STALE_HOURS + 1) * 3_600_000),
    };
    const prisma = makePrisma({
      merchant: {
        findMany: jest.fn().mockResolvedValue([{ id: "m1", stores: [{ id: "s1" }] }]),
      },
      syncRun: { findFirst: jest.fn().mockResolvedValue(staleRun) },
    });
    const out = await new AdminDashboardSummaryService(prisma, makeDashboard()).summary(NOW);
    expect(out.alerts).toEqual([expect.objectContaining({ code: "ERP_SYNC_STALE", count: 1 })]);

    const freshPrisma = makePrisma({
      merchant: {
        findMany: jest.fn().mockResolvedValue([{ id: "m1", stores: [{ id: "s1" }] }]),
      },
      syncRun: {
        findFirst: jest.fn().mockResolvedValue({
          status: "completed",
          startedAt: new Date(NOW.getTime() - 3_600_000),
        }),
      },
    });
    const fresh = await new AdminDashboardSummaryService(freshPrisma, makeDashboard()).summary(
      NOW,
    );
    expect(fresh.alerts).toEqual([]);
  });

  it("sem merchant com conector não consulta SyncRun", async () => {
    const findFirst = jest.fn();
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({ merchant: { findMany }, syncRun: { findFirst } });
    await new AdminDashboardSummaryService(prisma, makeDashboard()).summary(NOW);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true, connectorType: { not: null } } }),
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("summary usa a hora corrente por default", async () => {
    const before = Date.now();
    const dashboard = makeDashboard();
    await new AdminDashboardSummaryService(makePrisma(), dashboard).summary();
    const to = dashboard.finance.mock.calls[0][0].to as Date;
    expect(to.getTime()).toBeGreaterThanOrEqual(before);
    expect(to.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
