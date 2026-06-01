import { Module } from "@nestjs/common";
import { PackingService } from "./packing.service";
import { PickingController } from "./picking.controller";
import { PickingEvents } from "./picking.events";
import { PickingSessionService } from "./picking-session.service";
import { PickingService } from "./picking.service";
import { SubstitutionController } from "./substitution.controller";
import { SubstitutionScheduler } from "./substitution.scheduler";
import { SubstitutionService } from "./substitution.service";

@Module({
  controllers: [PickingController, SubstitutionController],
  providers: [
    PickingService,
    PickingSessionService,
    SubstitutionService,
    SubstitutionScheduler,
    PackingService,
    PickingEvents,
  ],
  exports: [PickingService],
})
export class PickingModule {}
