import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";

export const ENRICHMENT_QUEUE = "enrichment";

export type EnrichJobName = "product" | "store" | "pending";

export interface EnrichJobData {
  productId?: string;
  storeId?: string;
}

@Injectable()
export class EnrichmentQueueService {
  constructor(@InjectQueue(ENRICHMENT_QUEUE) private readonly queue: Queue<EnrichJobData>) {}

  enqueueProduct(productId: string) {
    return this.queue.add("product", { productId }, this.opts());
  }

  enqueueStore(storeId: string) {
    return this.queue.add("store", { storeId }, this.opts());
  }

  enqueuePending() {
    return this.queue.add("pending", {}, this.opts());
  }

  private opts() {
    return {
      attempts: 3,
      backoff: { type: "exponential" as const, delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    };
  }
}
