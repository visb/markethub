import { BullModule, getQueueToken } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import type { Queue } from "bullmq";
import { ErpModule } from "../erp/erp.module";
import { IntegrationModule } from "../integration/integration.module";
import { PickingModule } from "../picking/picking.module";
import { EventIdempotencyService } from "./event-idempotency.service";
import { OrderPaidHandlers } from "./handlers/order-paid.handlers";
import {
  OrderPaidGerarPickingProcessor,
  OrderPaidNotificarProcessor,
  OrderPaidPushErpProcessor,
} from "./handlers/order-paid.processor";
import { OutboxPublisher } from "./outbox.publisher";
import { OUTBOX_RELAY_QUEUE, OutboxRelayProcessor } from "./outbox-relay.processor";
import { OutboxRelayScheduler } from "./outbox-relay.scheduler";
import { OutboxRelayService } from "./outbox-relay.service";
import { HANDLER_QUEUE_NAMES, HANDLER_QUEUES } from "./subscriptions";

/**
 * Eventos de domínio (story 45): transactional outbox + relay por poll + fan-out
 * por subscriber. Exporta o OutboxPublisher p/ os agregados emitirem eventos na
 * própria TX; o resto (relay, filas por handler, idempotência) é interno.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: OUTBOX_RELAY_QUEUE },
      ...HANDLER_QUEUE_NAMES.map((name) => ({ name })),
    ),
    ErpModule,
    PickingModule,
    IntegrationModule,
  ],
  providers: [
    OutboxPublisher,
    OutboxRelayService,
    OutboxRelayScheduler,
    OutboxRelayProcessor,
    EventIdempotencyService,
    OrderPaidHandlers,
    OrderPaidPushErpProcessor,
    OrderPaidGerarPickingProcessor,
    OrderPaidNotificarProcessor,
    {
      provide: HANDLER_QUEUES,
      useFactory: (...queues: Queue[]) =>
        new Map(HANDLER_QUEUE_NAMES.map((name, i) => [name, queues[i]!])),
      inject: HANDLER_QUEUE_NAMES.map((name) => getQueueToken(name)),
    },
  ],
  exports: [OutboxPublisher],
})
export class EventsModule {}
