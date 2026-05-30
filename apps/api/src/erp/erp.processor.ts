import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { ErpService } from "./erp.service";
import { ERP_QUEUE, type ErpJobData, type ErpJobName } from "./erp.queue";

@Processor(ERP_QUEUE)
export class ErpProcessor extends WorkerHost {
  private readonly logger = new Logger(ErpProcessor.name);

  constructor(private readonly erp: ErpService) {
    super();
  }

  async process(job: Job<ErpJobData, unknown, ErpJobName>): Promise<{ runId: string }> {
    const { storeId, since } = job.data;
    const sinceDate = since ? new Date(since) : undefined;

    switch (job.name) {
      case "full":
        return { runId: await this.erp.runFullSync(storeId) };
      case "prices":
        return { runId: await this.erp.runPriceSync(storeId, sinceDate) };
      case "stock":
        return { runId: await this.erp.runStockSync(storeId, sinceDate) };
      default:
        throw new Error(`Unknown ERP job: ${job.name}`);
    }
  }
}
