import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { HandlerJobData, OrderPaidPayload } from "../event-types";
import { EventIdempotencyService } from "../event-idempotency.service";
import {
  ORDER_PAID_GERAR_PICKING,
  ORDER_PAID_NOTIFICAR,
  ORDER_PAID_PUSH_ERP,
} from "../subscriptions";
import { OrderPaidHandlers } from "./order-paid.handlers";

/**
 * Processors BullMQ dos handlers do `order.paid` (story 45) — casca fina: cada um
 * consome a própria fila (retry/backoff isolados, configurados no enqueue do
 * relay) e delega o efeito ao OrderPaidHandlers atrás da trava de idempotência
 * (ProcessedEvent). Falha relança → BullMQ retenta só ESTE handler.
 */

@Processor(ORDER_PAID_PUSH_ERP)
export class OrderPaidPushErpProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: OrderPaidHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, ORDER_PAID_PUSH_ERP, () =>
      this.handlers.pushErp(job.data.payload as OrderPaidPayload),
    );
  }
}

@Processor(ORDER_PAID_GERAR_PICKING)
export class OrderPaidGerarPickingProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: OrderPaidHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, ORDER_PAID_GERAR_PICKING, () =>
      this.handlers.gerarPicking(job.data.payload as OrderPaidPayload),
    );
  }
}

@Processor(ORDER_PAID_NOTIFICAR)
export class OrderPaidNotificarProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: OrderPaidHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, ORDER_PAID_NOTIFICAR, () =>
      this.handlers.notificar(job.data.payload as OrderPaidPayload),
    );
  }
}
