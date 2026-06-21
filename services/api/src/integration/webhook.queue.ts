import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";

export const WEBHOOK_QUEUE = "webhook";

/** Eventos de pedido cobertos no MVP (story 09). */
export type WebhookEvent = "order.created" | "order.status_changed";
export const WEBHOOK_EVENTS: WebhookEvent[] = ["order.created", "order.status_changed"];

export interface WebhookJobData {
  webhookId: string;
  event: WebhookEvent | "ping";
  /** Payload de domínio já montado (sem o envelope/timestamp). */
  data: Record<string, unknown>;
}

@Injectable()
export class WebhookQueueService {
  constructor(@InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue<WebhookJobData>) {}

  enqueue(job: WebhookJobData) {
    return this.queue.add(job.event, job, {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 1000,
    });
  }
}
