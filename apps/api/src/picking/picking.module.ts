import { Module } from "@nestjs/common";
import { PickingController } from "./picking.controller";
import { PickingEvents } from "./picking.events";
import { PickingSessionService } from "./picking-session.service";
import { PickingService } from "./picking.service";

@Module({
  controllers: [PickingController],
  providers: [PickingService, PickingSessionService, PickingEvents],
  exports: [PickingService],
})
export class PickingModule {}
