import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { EventIdempotencyService } from "../event-idempotency.service";
import type { HandlerJobData, OrderRefundRequestedPayload } from "../event-types";
import { ORDER_REFUND_REQUESTED_EMITIR_ESTORNO } from "../subscriptions";
import { OrderRefundRequestedHandlers } from "./order-refund-requested.handlers";

/**
 * Processor BullMQ do handler do `order.refund_requested` (story 67) — casca
 * fina: consome a própria fila (retry/backoff isolados) e delega ao
 * OrderRefundRequestedHandlers atrás da trava de idempotência (ProcessedEvent).
 * Falha relança → BullMQ retenta só este handler.
 */
@Processor(ORDER_REFUND_REQUESTED_EMITIR_ESTORNO)
export class OrderRefundRequestedEmitirEstornoProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: OrderRefundRequestedHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, ORDER_REFUND_REQUESTED_EMITIR_ESTORNO, () =>
      this.handlers.emitirEstorno(job.data.payload as OrderRefundRequestedPayload),
    );
  }
}
