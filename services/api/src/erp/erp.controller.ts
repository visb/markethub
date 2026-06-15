import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { Roles } from "../auth/decorators/roles.decorator";
import { ConnectorRegistry } from "./connector-registry";
import { ErpService } from "./erp.service";
import { ErpQueueService } from "./erp.queue";
import { ErpScheduler } from "./erp.scheduler";

class TriggerSyncDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsIn(["full", "prices", "stock"])
  type?: "full" | "prices" | "stock";

  /** true = roda inline (await) em vez de enfileirar. Útil para teste/admin. */
  @IsOptional()
  @IsBoolean()
  inline?: boolean;
}

@Roles("admin")
@Controller("erp")
export class ErpController {
  constructor(
    private readonly erp: ErpService,
    private readonly queue: ErpQueueService,
    private readonly registry: ConnectorRegistry,
    private readonly scheduler: ErpScheduler,
  ) {}

  @Get("connectors")
  connectors() {
    return { connectors: this.registry.list() };
  }

  /** Enfileira sync incremental (preço+estoque) de todas as lojas ativas. */
  @Post("sync/scheduled")
  runScheduled() {
    return this.scheduler.runScheduledSyncs();
  }

  @Post("sync")
  async triggerSync(@Body() dto: TriggerSyncDto) {
    const type = dto.type ?? "full";
    if (dto.inline) {
      const runId =
        type === "full"
          ? await this.erp.runFullSync(dto.storeId)
          : type === "prices"
            ? await this.erp.runPriceSync(dto.storeId)
            : await this.erp.runStockSync(dto.storeId);
      return { mode: "inline", runId };
    }
    const job =
      type === "full"
        ? await this.queue.enqueueFullSync(dto.storeId)
        : type === "prices"
          ? await this.queue.enqueuePriceSync(dto.storeId)
          : await this.queue.enqueueStockSync(dto.storeId);
    return { mode: "queued", jobId: job.id };
  }

  @Get("runs")
  runs(@Query("storeId") storeId?: string) {
    return this.erp.listRuns(storeId);
  }
}
