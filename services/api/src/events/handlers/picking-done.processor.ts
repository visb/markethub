import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { HandlerJobData, PickingDonePayload } from "../event-types";
import { EventIdempotencyService } from "../event-idempotency.service";
import {
  PICKING_DONE_INICIAR_ENTREGA,
  PICKING_DONE_NOTIFICAR,
  PICKING_DONE_VERIFICAR_SHORTFALL_REFUND,
} from "../subscriptions";
import { isFinalAttempt } from "./order-canceled.processor";
import { PickingDoneHandlers } from "./picking-done.handlers";

/**
 * Processors BullMQ dos handlers do `picking.done` (story 46) — casca fina:
 * cada um consome a própria fila (retry/backoff isolados) e delega o efeito ao
 * PickingDoneHandlers atrás da trava de idempotência (ProcessedEvent). Falha
 * relança → BullMQ retenta só ESTE handler.
 */

@Processor(PICKING_DONE_INICIAR_ENTREGA)
export class PickingDoneIniciarEntregaProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: PickingDoneHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, PICKING_DONE_INICIAR_ENTREGA, () =>
      this.handlers.iniciarEntrega(job.data.payload as PickingDonePayload),
    );
  }
}

@Processor(PICKING_DONE_NOTIFICAR)
export class PickingDoneNotificarProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: PickingDoneHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, PICKING_DONE_NOTIFICAR, () =>
      this.handlers.notificar(job.data.payload as PickingDonePayload),
    );
  }
}

@Processor(PICKING_DONE_VERIFICAR_SHORTFALL_REFUND)
export class PickingDoneVerificarShortfallRefundProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: PickingDoneHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(
      job.data.eventId,
      PICKING_DONE_VERIFICAR_SHORTFALL_REFUND,
      () => this.handlers.verificarShortfallRefund(job.data.payload as PickingDonePayload),
    );
  }

  /**
   * Retries esgotados → marca o Refund `failed` (estado auditável; story 48).
   * Cada falha intermediária também dispara `failed`, por isso o guard.
   */
  @OnWorkerEvent("failed")
  async onFailed(job: Job<HandlerJobData> | undefined): Promise<void> {
    if (!job || !isFinalAttempt(job)) return;
    await this.handlers.shortfallEsgotado(job.data.payload as PickingDonePayload);
  }
}
