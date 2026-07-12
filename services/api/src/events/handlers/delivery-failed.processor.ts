import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { EventIdempotencyService } from "../event-idempotency.service";
import type { DeliveryFailedPayload, HandlerJobData } from "../event-types";
import { DELIVERY_FAILED_NOTIFICAR } from "../subscriptions";
import { DeliveryFailedHandlers } from "./delivery-failed.handlers";

/**
 * Processor BullMQ do handler do `delivery.failed` (story 61) — casca fina:
 * consome a própria fila (retry/backoff isolado) e delega ao
 * DeliveryFailedHandlers atrás da trava de idempotência (ProcessedEvent). Falha
 * relança → BullMQ retenta só ESTE handler.
 */
@Processor(DELIVERY_FAILED_NOTIFICAR)
export class DeliveryFailedNotificarProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: DeliveryFailedHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, DELIVERY_FAILED_NOTIFICAR, () =>
      this.handlers.notificar(job.data.payload as DeliveryFailedPayload),
    );
  }
}
