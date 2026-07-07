import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { HandlerJobData, OrderCreatedPayload } from "../event-types";
import { EventIdempotencyService } from "../event-idempotency.service";
import {
  ORDER_CREATED_GERAR_COBRANCA_PIX,
  ORDER_CREATED_NOTIFICAR,
} from "../subscriptions";
import { OrderCreatedHandlers } from "./order-created.handlers";

/**
 * Processors BullMQ dos handlers do `order.created` (story 46) — casca fina:
 * cada um consome a própria fila (retry/backoff isolados) e delega o efeito ao
 * OrderCreatedHandlers atrás da trava de idempotência (ProcessedEvent). Falha
 * relança → BullMQ retenta só ESTE handler.
 */

@Processor(ORDER_CREATED_GERAR_COBRANCA_PIX)
export class OrderCreatedGerarCobrancaPixProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: OrderCreatedHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, ORDER_CREATED_GERAR_COBRANCA_PIX, () =>
      this.handlers.gerarCobrancaPix(job.data.payload as OrderCreatedPayload),
    );
  }
}

@Processor(ORDER_CREATED_NOTIFICAR)
export class OrderCreatedNotificarProcessor extends WorkerHost {
  constructor(
    private readonly idempotency: EventIdempotencyService,
    private readonly handlers: OrderCreatedHandlers,
  ) {
    super();
  }

  async process(job: Job<HandlerJobData>): Promise<void> {
    await this.idempotency.runOnce(job.data.eventId, ORDER_CREATED_NOTIFICAR, () =>
      this.handlers.notificar(job.data.payload as OrderCreatedPayload),
    );
  }
}
