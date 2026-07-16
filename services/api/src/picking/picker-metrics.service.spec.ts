import {
  PickerMetricsService,
  computePickerMetrics,
  metricsPeriodStart,
} from "./picker-metrics.service";

/**
 * Story 65 — métricas próprias do separador. Testa o recorte de período (mesma
 * convenção da story 60), a agregação pura (itens/hora ignora task sem
 * timestamps, taxas com zero itens → null, nunca NaN) e o service (filtra por
 * pickerId + readyAt — picker só vê o seu). Prisma mockado — sem rede/DB.
 */

const HOUR = 60 * 60 * 1000;
const T0 = new Date("2026-07-15T10:00:00.000Z");

function task(over: {
  startedAt?: Date | null;
  packedAt?: Date | null;
  picked?: number;
  substituted?: number;
  refused?: number;
}) {
  const items = [
    ...Array<{ status: string }>(over.picked ?? 0).fill({ status: "picked" }),
    ...Array<{ status: string }>(over.substituted ?? 0).fill({ status: "substituted" }),
    ...Array<{ status: string }>(over.refused ?? 0).fill({ status: "refused" }),
  ];
  return { startedAt: over.startedAt ?? null, packedAt: over.packedAt ?? null, items };
}

describe("metricsPeriodStart", () => {
  it("today: zera hora/min/seg do dia corrente", () => {
    const start = metricsPeriodStart("today", new Date("2026-07-11T15:30:45.000Z"));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
  });

  it("7d/30d: subtrai N dias de agora", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    expect(metricsPeriodStart("7d", now).toISOString()).toBe("2026-07-24T12:00:00.000Z");
    expect(metricsPeriodStart("30d", now).toISOString()).toBe("2026-07-01T12:00:00.000Z");
  });
});

describe("computePickerMetrics", () => {
  it("agrega tarefas, itens separados, itens/hora e taxas", () => {
    // 2 tasks de 30min cada (1h ativa) com 8 picked + 1 substituted + 1 refused.
    const tasks = [
      task({ startedAt: T0, packedAt: new Date(T0.getTime() + HOUR / 2), picked: 4, substituted: 1 }),
      task({ startedAt: T0, packedAt: new Date(T0.getTime() + HOUR / 2), picked: 4, refused: 1 }),
    ];
    const m = computePickerMetrics(tasks);
    expect(m.tasksCompleted).toBe(2);
    expect(m.itemsPicked).toBe(8);
    expect(m.itemsPerHour).toBe(8); // 8 itens em 1h ativa
    expect(m.substitutionRate).toBe(0.1); // 1/10
    expect(m.refusalRate).toBe(0.1); // 1/10
  });

  it("task sem startedAt/packedAt fica FORA do itens/hora (numerador e divisor)", () => {
    const tasks = [
      task({ startedAt: T0, packedAt: new Date(T0.getTime() + HOUR), picked: 6 }),
      task({ startedAt: null, packedAt: null, picked: 100 }), // sem timestamps
      task({ startedAt: T0, packedAt: null, picked: 50 }), // só started
    ];
    const m = computePickerMetrics(tasks);
    expect(m.itemsPicked).toBe(156); // conta no total…
    expect(m.itemsPerHour).toBe(6); // …mas não no ritmo (só a task cronometrada)
  });

  it("nenhuma task com tempo ativo → itens/hora null (divisor zero, sem NaN/Infinity)", () => {
    const m = computePickerMetrics([task({ picked: 3 })]);
    expect(m.itemsPerHour).toBeNull();
    expect(m.substitutionRate).toBe(0);
    expect(m.refusalRate).toBe(0);
  });

  it("zero tasks/itens → contadores 0 e taxas null (sem divisão por zero)", () => {
    const m = computePickerMetrics([]);
    expect(m).toEqual({
      tasksCompleted: 0,
      itemsPicked: 0,
      itemsPerHour: null,
      substitutionRate: null,
      refusalRate: null,
    });
    for (const v of Object.values(m)) {
      expect(Number.isNaN(v as number)).toBe(false);
    }
  });

  it("packedAt anterior/igual a startedAt não soma tempo ativo (dado sujo)", () => {
    const m = computePickerMetrics([task({ startedAt: T0, packedAt: T0, picked: 2 })]);
    expect(m.itemsPerHour).toBeNull();
  });

  it("arredonda itens/hora a 1 casa e taxas a 4", () => {
    const m = computePickerMetrics([
      task({ startedAt: T0, packedAt: new Date(T0.getTime() + 45 * 60 * 1000), picked: 5, substituted: 1, refused: 1 }),
    ]);
    expect(m.itemsPerHour).toBe(6.7); // 5 / 0.75h = 6.666…
    expect(m.substitutionRate).toBe(0.1429); // 1/7
    expect(m.refusalRate).toBe(0.1429);
  });
});

describe("PickerMetricsService.myMetrics", () => {
  function makeService(rows: unknown[] = []) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { pickTask: { findMany } } as never;
    return { svc: new PickerMetricsService(prisma), findMany };
  }

  it("filtra por pickerId do usuário + readyAt na janela (picker só vê o seu)", async () => {
    const { svc, findMany } = makeService();
    const before = Date.now();
    await svc.myMetrics("u1", "7d");
    const where = findMany.mock.calls[0][0].where;
    expect(where.pickerId).toBe("u1");
    const gte = where.readyAt.gte as Date;
    // janela de 7 dias a partir de agora
    expect(before - gte.getTime()).toBeGreaterThanOrEqual(7 * 24 * HOUR - 1000);
    expect(Date.now() - gte.getTime()).toBeLessThanOrEqual(7 * 24 * HOUR + 1000);
  });

  it("devolve período + métricas agregadas das tasks retornadas", async () => {
    const { svc } = makeService([
      task({ startedAt: T0, packedAt: new Date(T0.getTime() + HOUR), picked: 12 }),
    ]);
    const out = await svc.myMetrics("u1", "today");
    expect(out).toEqual({
      period: "today",
      tasksCompleted: 1,
      itemsPicked: 12,
      itemsPerHour: 12,
      substitutionRate: 0,
      refusalRate: 0,
    });
  });
});
