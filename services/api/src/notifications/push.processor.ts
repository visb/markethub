import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PushService } from "./push.service";
import { PUSH_QUEUE, type PushJobData } from "./push.queue";

/**
 * Consome a fila de push (story 49): executa o envio real fora do caminho do
 * request. Falha do provedor PROPAGA → BullMQ retenta conforme PUSH_JOB_OPTS;
 * ao esgotar, o job é descartado (best-effort, sem dead-letter).
 */
@Processor(PUSH_QUEUE)
export class PushProcessor extends WorkerHost {
  constructor(private readonly push: PushService) {
    super();
  }

  async process(job: Job<PushJobData>): Promise<void> {
    await this.push.deliverToUser(job.data.userId, job.data.message);
  }
}
