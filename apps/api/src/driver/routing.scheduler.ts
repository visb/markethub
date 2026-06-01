import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Env } from "../config/env";
import { OfferService } from "./offer.service";
import { RoutingService } from "./routing.service";

/**
 * Jobs periódicos de entrega: matching (monta rotas, S4.3) e oferta/reoferta com
 * expiração (S4.4).
 */
@Injectable()
export class RoutingScheduler {
  private readonly logger = new Logger(RoutingScheduler.name);

  constructor(
    private readonly routing: RoutingService,
    private readonly offers: OfferService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get enabled(): boolean {
    return this.config.get("MATCHING_SCHEDULE_ENABLED", { infer: true });
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async match(): Promise<void> {
    if (!this.enabled) return;
    const n = await this.routing.buildPendingRoutes();
    if (n > 0) this.logger.log(`Rotas criadas neste ciclo: ${n}`);
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async assign(): Promise<void> {
    if (!this.enabled) return;
    await this.offers.assignOffers();
  }
}
