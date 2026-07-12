import { BullModule, getQueueToken } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import type { Queue } from "bullmq";
import { ErpModule } from "../erp/erp.module";
import { IntegrationModule } from "../integration/integration.module";
import { PixChargeModule } from "../payment/pix-charge.module";
import { RefundModule } from "../payment/refund.module";
import { PickingModule } from "../picking/picking.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { EventIdempotencyService } from "./event-idempotency.service";
import { OrderCanceledHandlers } from "./handlers/order-canceled.handlers";
import {
  OrderCanceledEmitirEstornoProcessor,
  OrderCanceledLiberarSlotProcessor,
  OrderCanceledNotificarProcessor,
} from "./handlers/order-canceled.processor";
import { OrderGroupCanceledHandlers } from "./handlers/order-group-canceled.handlers";
import {
  OrderGroupCanceledEmitirEstornoProcessor,
  OrderGroupCanceledNotificarProcessor,
} from "./handlers/order-group-canceled.processor";
import { DeliveryFailedHandlers } from "./handlers/delivery-failed.handlers";
import { DeliveryFailedNotificarProcessor } from "./handlers/delivery-failed.processor";
import { OrderCreatedHandlers } from "./handlers/order-created.handlers";
import {
  OrderCreatedGerarCobrancaPixProcessor,
  OrderCreatedNotificarProcessor,
} from "./handlers/order-created.processor";
import { OrderPaidHandlers } from "./handlers/order-paid.handlers";
import {
  OrderPaidGerarPickingProcessor,
  OrderPaidNotificarProcessor,
  OrderPaidPushErpProcessor,
} from "./handlers/order-paid.processor";
import { PickingDoneHandlers } from "./handlers/picking-done.handlers";
import {
  PickingDoneIniciarEntregaProcessor,
  PickingDoneNotificarProcessor,
  PickingDoneVerificarShortfallRefundProcessor,
} from "./handlers/picking-done.processor";
import { OutboxModule } from "./outbox.module";
import { OUTBOX_RELAY_QUEUE, OutboxRelayProcessor } from "./outbox-relay.processor";
import { OutboxRelayScheduler } from "./outbox-relay.scheduler";
import { OutboxRelayService } from "./outbox-relay.service";
import { HANDLER_QUEUE_NAMES, HANDLER_QUEUES } from "./subscriptions";

/**
 * Eventos de domínio (story 45): transactional outbox + relay por poll + fan-out
 * por subscriber. Re-exporta o OutboxModule (publisher) p/ os agregados emitirem
 * eventos na própria TX; o resto (relay, filas por handler, idempotência) é
 * interno. Story 46 adiciona os handlers de `order.created` e `picking.done`;
 * story 48 os de `order.canceled` + o shortfall refund no `picking.done`.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: OUTBOX_RELAY_QUEUE },
      ...HANDLER_QUEUE_NAMES.map((name) => ({ name })),
    ),
    OutboxModule,
    ErpModule,
    IntegrationModule,
    PickingModule,
    PixChargeModule,
    RefundModule,
    SchedulingModule,
  ],
  providers: [
    OutboxRelayService,
    OutboxRelayScheduler,
    OutboxRelayProcessor,
    EventIdempotencyService,
    OrderCreatedHandlers,
    OrderCreatedGerarCobrancaPixProcessor,
    OrderCreatedNotificarProcessor,
    OrderPaidHandlers,
    OrderPaidPushErpProcessor,
    OrderPaidGerarPickingProcessor,
    OrderPaidNotificarProcessor,
    PickingDoneHandlers,
    PickingDoneIniciarEntregaProcessor,
    PickingDoneNotificarProcessor,
    PickingDoneVerificarShortfallRefundProcessor,
    OrderCanceledHandlers,
    OrderCanceledLiberarSlotProcessor,
    OrderCanceledEmitirEstornoProcessor,
    OrderCanceledNotificarProcessor,
    OrderGroupCanceledHandlers,
    OrderGroupCanceledEmitirEstornoProcessor,
    OrderGroupCanceledNotificarProcessor,
    DeliveryFailedHandlers,
    DeliveryFailedNotificarProcessor,
    {
      provide: HANDLER_QUEUES,
      useFactory: (...queues: Queue[]) =>
        new Map(HANDLER_QUEUE_NAMES.map((name, i) => [name, queues[i]!])),
      inject: HANDLER_QUEUE_NAMES.map((name) => getQueueToken(name)),
    },
  ],
  exports: [OutboxModule],
})
export class EventsModule {}
