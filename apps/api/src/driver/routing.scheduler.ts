import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Env } from "../config/env";
import { RoutingService } from "./routing.service";

/** Job periódico de matching (S4.3): monta rotas das separações prontas. */
@Injectable()
export class RoutingScheduler {
  private readonly logger = new Logger(RoutingScheduler.name);

  constructor(
    private readonly routing: RoutingService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick(): Promise<void> {
    if (!this.config.get("MATCHING_SCHEDULE_ENABLED", { infer: true })) return;
    const n = await this.routing.buildPendingRoutes();
    if (n > 0) this.logger.log(`Rotas criadas neste ciclo: ${n}`);
  }
}
