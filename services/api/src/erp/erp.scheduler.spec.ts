import type { ConfigService } from "@nestjs/config";
import type { SchedulerRegistry } from "@nestjs/schedule";
import type { CronJob } from "cron";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import { ErpScheduler } from "./erp.scheduler";
import type { ErpQueueService } from "./erp.queue";

/**
 * Backfill de cobertura (story 26). O scheduler é wiring de cron (excluído do
 * coverage pelo gate da story 19), mas o disparo precisa de spec: on/off via
 * env e o fan-out de price+stock por loja ativa com delta do último sync.
 */

function makeScheduler(opts: {
  enabled: boolean;
  stores?: Array<{ id: string }>;
  lastSuccess?: Record<string, Date>;
}) {
  const config = {
    get: jest.fn((key: keyof Env) => {
      if (key === "SYNC_SCHEDULE_ENABLED") return opts.enabled;
      if (key === "SYNC_CRON") return "0 */15 * * * *";
      return undefined;
    }),
  } as unknown as ConfigService<Env, true>;

  const addCronJob = jest.fn();
  const registry = { addCronJob } as unknown as SchedulerRegistry;

  const findFirst = jest.fn(({ where }: { where: { storeId: string } }) =>
    Promise.resolve(
      opts.lastSuccess?.[where.storeId]
        ? { finishedAt: opts.lastSuccess[where.storeId] }
        : null,
    ),
  );
  const prisma = {
    store: { findMany: jest.fn().mockResolvedValue(opts.stores ?? []) },
    syncRun: { findFirst },
  } as unknown as PrismaService;

  const enqueuePriceSync = jest.fn().mockResolvedValue(undefined);
  const enqueueStockSync = jest.fn().mockResolvedValue(undefined);
  const queue = { enqueuePriceSync, enqueueStockSync } as unknown as ErpQueueService;

  const scheduler = new ErpScheduler(config, registry, prisma, queue);
  jest.spyOn(scheduler["logger"], "log").mockImplementation(() => undefined);
  return { scheduler, addCronJob, enqueuePriceSync, enqueueStockSync, findFirst };
}

describe("ErpScheduler.onModuleInit", () => {
  it("não registra cron quando SYNC_SCHEDULE_ENABLED=false", () => {
    const { scheduler, addCronJob } = makeScheduler({ enabled: false });
    scheduler.onModuleInit();
    expect(addCronJob).not.toHaveBeenCalled();
  });

  it("registra e inicia o cron quando habilitado", () => {
    const { scheduler, addCronJob } = makeScheduler({ enabled: true });
    scheduler.onModuleInit();
    expect(addCronJob).toHaveBeenCalledWith("erp-incremental-sync", expect.anything());
    // Evita timer pendente: para o job registrado.
    const job = addCronJob.mock.calls[0]![1] as CronJob;
    job.stop();
  });
});

describe("ErpScheduler.runScheduledSyncs", () => {
  it("não enfileira nada quando não há lojas elegíveis", async () => {
    const { scheduler, enqueuePriceSync, enqueueStockSync } = makeScheduler({
      enabled: true,
      stores: [],
    });
    const res = await scheduler.runScheduledSyncs();
    expect(res).toEqual({ stores: 0, jobs: 0 });
    expect(enqueuePriceSync).not.toHaveBeenCalled();
    expect(enqueueStockSync).not.toHaveBeenCalled();
  });

  it("enfileira price+stock por loja (2 jobs cada)", async () => {
    const { scheduler, enqueuePriceSync, enqueueStockSync } = makeScheduler({
      enabled: true,
      stores: [{ id: "s1" }, { id: "s2" }],
    });
    const res = await scheduler.runScheduledSyncs();
    expect(res).toEqual({ stores: 2, jobs: 4 });
    expect(enqueuePriceSync).toHaveBeenCalledTimes(2);
    expect(enqueueStockSync).toHaveBeenCalledTimes(2);
    // sem último sync → delta indefinido
    expect(enqueuePriceSync).toHaveBeenCalledWith("s1", undefined);
  });

  it("usa o finishedAt do último sync com sucesso como delta", async () => {
    const last = new Date("2026-06-01T00:00:00.000Z");
    const { scheduler, enqueuePriceSync, enqueueStockSync, findFirst } = makeScheduler({
      enabled: true,
      stores: [{ id: "s1" }],
      lastSuccess: { s1: last },
    });
    await scheduler.runScheduledSyncs();
    expect(enqueuePriceSync).toHaveBeenCalledWith("s1", last);
    expect(enqueueStockSync).toHaveBeenCalledWith("s1", last);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "s1", status: "success" }),
      }),
    );
  });
});
