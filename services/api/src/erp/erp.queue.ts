import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";

export const ERP_QUEUE = "erp";

export type ErpJobName = "full" | "prices" | "stock";

export interface ErpJobData {
  storeId: string;
  since?: string; // ISO date para delta
}

@Injectable()
export class ErpQueueService {
  constructor(@InjectQueue(ERP_QUEUE) private readonly queue: Queue<ErpJobData>) {}

  enqueueFullSync(storeId: string) {
    return this.queue.add("full", { storeId }, this.opts());
  }

  enqueuePriceSync(storeId: string, since?: Date) {
    return this.queue.add("prices", { storeId, since: since?.toISOString() }, this.opts());
  }

  enqueueStockSync(storeId: string, since?: Date) {
    return this.queue.add("stock", { storeId, since: since?.toISOString() }, this.opts());
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
