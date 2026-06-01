import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SubstitutionService } from "./substitution.service";

/** Aplica a política de timeout de substituições pendentes (S3.4). */
@Injectable()
export class SubstitutionScheduler {
  private readonly logger = new Logger(SubstitutionScheduler.name);

  constructor(private readonly substitution: SubstitutionService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async resolveExpired(): Promise<void> {
    const n = await this.substitution.resolveExpired();
    if (n > 0) this.logger.log(`Substituições resolvidas por timeout: ${n}`);
  }
}
