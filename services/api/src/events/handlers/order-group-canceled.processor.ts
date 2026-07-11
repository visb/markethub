import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { EventIdempotencyService } from "../event-idempotency.service";
import type { HandlerJobData, OrderGroupCanceledPayload } from "../event-types";
import {
  ORDER_GROUP_CANCELED_EMITIR_ESTORNO,
  ORDER_GROUP_CANCELED_NOTIFICAR,
} from "../subscriptions";
import { isFinalAttempt } from "./order-canceled.processor";
import { OrderGroupCanceledHandlers } from "./order-group-canceled.handlers";

/**
 * Processors BullMQ dos handlers do `order.group_canceled` (story 54) — casca
 * fina: cada um consome a própria fila (retry/backoff isolados) e delega ao
 * OrderGroupCanceledHandlers atrás da trava de idempotência (ProcessedEvent).
 * Falha relança → BullMQ retenta só ESTE handler.
 */

@Processor(ORDER_GROUP_CANCELED_EMITIR_ESTORNO)
export class OrderGroupCanceledEmitirEstornoProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: OrderGroupCanceledHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, ORDER_GROUP_CANCELED_EMITIR_ESTORNO, () =>
      this.handlers.emitirEstorno(job.data.payload as OrderGroupCanceledPayload),
    );
  }

  /** Retries esgotados → marca o Refund do pedido `failed` (estado auditável). */
  @OnWorkerEvent("failed")
  async onFailed(job: Job<HandlerJobData> | undefined): Promise<void> {
    if (!job || !isFinalAttempt(job)) return;
    await this.handlers.estornoEsgotado(job.data.payload as OrderGroupCanceledPayload);
  }
}

@Processor(ORDER_GROUP_CANCELED_NOTIFICAR)
export class OrderGroupCanceledNotificarProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: OrderGroupCanceledHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, ORDER_GROUP_CANCELED_NOTIFICAR, () =>
      this.handlers.notificar(job.data.payload as OrderGroupCanceledPayload),
    );
  }
}
