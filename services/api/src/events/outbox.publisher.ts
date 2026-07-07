import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { DomainEventInput, DomainEventType } from "./event-types";

/**
 * Publisher tipado do transactional outbox (story 45). Grava a row OutboxEvent
 * usando o CLIENT TRANSACIONAL recebido — o evento participa da mesma TX da
 * mudança de estado do agregado (atômico: sem TX commitada não há evento; sem
 * evento não há TX → zero pedido órfão). Emitir evento crítico fora da TX do
 * agregado é proibido; por isso o `tx` é parâmetro obrigatório.
 */
@Injectable()
export class OutboxPublisher {
  publish<T extends DomainEventType>(tx: Prisma.TransactionClient, event: DomainEventInput<T>) {
    return tx.outboxEvent.create({
      data: {
        type: event.type,
        payload: event.payload as unknown as Prisma.InputJsonValue,
        aggregateId: event.aggregateId,
      },
    });
  }
}
