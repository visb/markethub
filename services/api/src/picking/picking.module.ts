import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { IntegrationModule } from "../integration/integration.module";
import { RefundModule } from "../payment/refund.module";
import { HandoffService } from "./handoff.service";
import { OrderEvents } from "./order.events";
import { OrderTrackingService } from "./order-tracking.service";
import { PickingController } from "./picking.controller";
import { PickingEvents } from "./picking.events";
import { PickingGateway } from "./picking.gateway";
import { PickingSessionService } from "./picking-session.service";
import { PickingService } from "./picking.service";
import { SubstitutionController } from "./substitution.controller";
import { SubstitutionScheduler } from "./substitution.scheduler";
import { SubstitutionService } from "./substitution.service";

@Module({
  imports: [JwtModule.register({}), IntegrationModule, RefundModule],
  controllers: [PickingController, SubstitutionController],
  providers: [
    PickingService,
    PickingSessionService,
    SubstitutionService,
    SubstitutionScheduler,
    HandoffService,
    PickingGateway,
    PickingEvents,
    OrderEvents,
    OrderTrackingService,
  ],
  exports: [PickingService, HandoffService, OrderTrackingService, PickingEvents, OrderEvents],
})
export class PickingModule {}
