import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { EnrichmentService } from "./enrichment.service";
import { ENRICHMENT_QUEUE, type EnrichJobData, type EnrichJobName } from "./enrichment.queue";

@Processor(ENRICHMENT_QUEUE)
export class EnrichmentProcessor extends WorkerHost {
  constructor(private readonly enrichment: EnrichmentService) {
    super();
  }

  async process(job: Job<EnrichJobData, unknown, EnrichJobName>): Promise<unknown> {
    switch (job.name) {
      case "product":
        return this.enrichment.enrichProduct(job.data.productId!);
      case "store":
        return this.enrichment.enrichStore(job.data.storeId!);
      case "pending":
        return this.enrichment.enrichPending();
      default:
        throw new Error(`Unknown enrichment job: ${job.name}`);
    }
  }
}
