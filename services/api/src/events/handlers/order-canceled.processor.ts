import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { HandlerJobData, OrderCanceledPayload } from "../event-types";
import { EventIdempotencyService } from "../event-idempotency.service";
import {
  ORDER_CANCELED_EMITIR_ESTORNO,
  ORDER_CANCELED_LIBERAR_SLOT,
  ORDER_CANCELED_NOTIFICAR,
} from "../subscriptions";
import { OrderCanceledHandlers } from "./order-canceled.handlers";

/**
 * Processors BullMQ dos handlers do `order.canceled` (story 48) — casca fina:
 * cada um consome a própria fila (retry/backoff isolados; attempts=5 + backoff
 * exponencial 5s definidos no enqueue do relay) e delega o efeito ao
 * OrderCanceledHandlers atrás da trava de idempotência (ProcessedEvent). Falha
 * relança → BullMQ retenta só ESTE handler (estorno fora do ar não bloqueia a
 * liberação do slot nem a notificação).
 */

/** Esgotou os retries? (attemptsMade já foi incrementado quando `failed` dispara.) */
export function isFinalAttempt(job: Pick<Job, "attemptsMade" | "opts">): boolean {
  return job.attemptsMade >= (job.opts.attempts ?? 1);
}

@Processor(ORDER_CANCELED_LIBERAR_SLOT)
export class OrderCanceledLiberarSlotProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: OrderCanceledHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, ORDER_CANCELED_LIBERAR_SLOT, () =>
      this.handlers.liberarSlot(job.data.payload as OrderCanceledPayload),
    );
  }
}

@Processor(ORDER_CANCELED_EMITIR_ESTORNO)
export class OrderCanceledEmitirEstornoProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: OrderCanceledHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, ORDER_CANCELED_EMITIR_ESTORNO, () =>
      this.handlers.emitirEstorno(job.data.payload as OrderCanceledPayload),
    );
  }

  /**
   * Retries esgotados → marca o Refund `failed` (estado auditável). Cada falha
   * intermediária também dispara `failed`, por isso o guard de última tentativa.
   */
  @OnWorkerEvent("failed")
  async onFailed(job: Job<HandlerJobData> | undefined): Promise<void> {
    if (!job || !isFinalAttempt(job)) return;
    await this.handlers.estornoEsgotado(job.data.payload as OrderCanceledPayload);
  }
}

@Processor(ORDER_CANCELED_NOTIFICAR)
export class OrderCanceledNotificarProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: OrderCanceledHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, ORDER_CANCELED_NOTIFICAR, () =>
      this.handlers.notificar(job.data.payload as OrderCanceledPayload),
    );
  }
}
