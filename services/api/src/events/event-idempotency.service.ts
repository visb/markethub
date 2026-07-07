import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Trava de idempotência dos handlers (story 45). BullMQ entrega at-least-once →
 * antes de rodar o efeito, o handler insere ProcessedEvent(eventId, handler);
 * violação do unique = já processado → short-circuit (ack sem efeito). Se o
 * efeito falhar, a trava é liberada para o retry do BullMQ reexecutar.
 */
@Injectable()
export class EventIdempotencyService {
  private readonly logger = new Logger(EventIdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roda `effect` no máximo uma vez por (eventId, handler).
   * @returns true se o efeito rodou; false se foi deduplicado.
   */
  async runOnce(eventId: string, handler: string, effect: () => Promise<void>): Promise<boolean> {
    try {
      await this.prisma.processedEvent.create({ data: { eventId, handler } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        this.logger.log(`dedupe: ${handler} já processou o evento ${eventId}`);
        return false;
      }
      throw err;
    }

    try {
      await effect();
      return true;
    } catch (err) {
      // efeito falhou → libera a trava p/ a retentativa não fazer short-circuit
      await this.prisma.processedEvent
        .delete({ where: { eventId_handler: { eventId, handler } } })
        .catch(() => undefined);
      throw err;
    }
  }
}
