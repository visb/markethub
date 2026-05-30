import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import type { SyncType } from "@prisma/client";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { ErpQueueService } from "./erp.queue";

/**
 * Agenda sync incremental de preço+estoque para todas as lojas ativas com conector.
 * Cron e on/off vêm do env (SYNC_CRON, SYNC_SCHEDULE_ENABLED).
 */
@Injectable()
export class ErpScheduler implements OnModuleInit {
  private readonly logger = new Logger(ErpScheduler.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly registry: SchedulerRegistry,
    private readonly prisma: PrismaService,
    private readonly queue: ErpQueueService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get("SYNC_SCHEDULE_ENABLED", { infer: true })) {
      this.logger.log("Scheduled ERP sync disabled (SYNC_SCHEDULE_ENABLED=false)");
      return;
    }
    const cron = this.config.get("SYNC_CRON", { infer: true });
    const job = new CronJob(cron, () => void this.runScheduledSyncs());
    this.registry.addCronJob("erp-incremental-sync", job);
    job.start();
    this.logger.log(`Scheduled ERP sync enabled: ${cron}`);
  }

  /** Enfileira price+stock sync (delta) para cada loja ativa com merchant conectado. */
  async runScheduledSyncs(): Promise<{ stores: number; jobs: number }> {
    const stores = await this.prisma.store.findMany({
      where: { active: true, merchant: { active: true, connectorType: { not: null } } },
      select: { id: true },
    });

    let jobs = 0;
    for (const store of stores) {
      await this.queue.enqueuePriceSync(store.id, await this.lastSuccess(store.id, "prices"));
      await this.queue.enqueueStockSync(store.id, await this.lastSuccess(store.id, "stock"));
      jobs += 2;
    }
    this.logger.log(`Enqueued incremental sync: ${stores.length} stores, ${jobs} jobs`);
    return { stores: stores.length, jobs };
  }

  /** Timestamp do último sync bem-sucedido daquele tipo, para delta. */
  private async lastSuccess(storeId: string, type: SyncType): Promise<Date | undefined> {
    const last = await this.prisma.syncRun.findFirst({
      where: { storeId, type, status: "success" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    });
    return last?.finishedAt ?? undefined;
  }
}
