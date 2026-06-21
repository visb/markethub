import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { IntegrationService } from "./integration.service";
import { WEBHOOK_QUEUE, type WebhookJobData } from "./webhook.queue";

/**
 * Consome a fila de webhooks (story 09): assina e entrega o POST, gravando o
 * status. Falha relança → BullMQ aplica retry/backoff (configurado no enqueue).
 */
@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  constructor(private readonly integration: IntegrationService) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    await this.integration.deliver(job.data);
  }
}
