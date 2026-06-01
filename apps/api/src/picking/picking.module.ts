import { Module } from "@nestjs/common";
import { HandoffService } from "./handoff.service";
import { PackingService } from "./packing.service";
import { PickingController } from "./picking.controller";
import { PickingEvents } from "./picking.events";
import { PickingSessionService } from "./picking-session.service";
import { PickingService } from "./picking.service";
import { PickupController } from "./pickup.controller";
import { SubstitutionController } from "./substitution.controller";
import { SubstitutionScheduler } from "./substitution.scheduler";
import { SubstitutionService } from "./substitution.service";

@Module({
  controllers: [PickingController, SubstitutionController, PickupController],
  providers: [
    PickingService,
    PickingSessionService,
    SubstitutionService,
    SubstitutionScheduler,
    PackingService,
    HandoffService,
    PickingEvents,
  ],
  exports: [PickingService, HandoffService],
})
export class PickingModule {}
