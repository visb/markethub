import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type { DomainEventType, HandlerJobData } from "./event-types";
import { HANDLER_QUEUES, handlerJobId, SUBSCRIPTIONS } from "./subscriptions";

/**
 * Relay do outbox (story 45): varre OutboxEvent pendentes (publishedAt = null,
 * por poll — decisão travada, não LISTEN/NOTIFY) e faz FAN-OUT POR SUBSCRIBER —
 * 1 job por handler inscrito no tipo, não 1 job por evento — para cada
 * side-effect ter retry isolado. Garantia at-least-once: se o processo cair
 * entre o enqueue e o update de publishedAt, o próximo poll reenfileira; o
 * jobId determinístico (eventId+handler) deduplica no BullMQ e o ProcessedEvent
 * deduplica no handler.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly batchSize: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(HANDLER_QUEUES) private readonly queues: ReadonlyMap<string, Queue<HandlerJobData>>,
    config: ConfigService<Env, true>,
  ) {
    this.batchSize = config.get("OUTBOX_RELAY_BATCH_SIZE", { infer: true });
  }

  /** Um passo do poll: publica um lote de eventos pendentes. */
  async relayPending(): Promise<{ events: number; jobs: number }> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: "asc" },
      take: this.batchSize,
    });

    let jobs = 0;
    for (const event of pending) {
      const handlers = SUBSCRIPTIONS[event.type as DomainEventType] ?? [];
      if (handlers.length === 0) {
        this.logger.warn(`outbox: evento ${event.id} de tipo sem subscriber (${event.type})`);
      }
      for (const handler of handlers) {
        const queue = this.queues.get(handler);
        if (!queue) {
          // registro inconsistente (handler sem fila) — não marca publicado p/ não perder o evento
          throw new Error(`outbox: handler "${handler}" inscrito em ${event.type} sem fila registrada`);
        }
        await queue.add(
          event.type,
          { eventId: event.id, type: event.type as DomainEventType, payload: event.payload },
          {
            jobId: handlerJobId(event.id, handler),
            attempts: 5,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: 200,
            removeOnFail: 1000,
          },
        );
        jobs += 1;
      }
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { publishedAt: new Date() },
      });
    }
    if (pending.length > 0) {
      this.logger.log(`outbox: publicados ${pending.length} eventos (${jobs} jobs)`);
    }
    return { events: pending.length, jobs };
  }
}
