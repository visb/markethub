import { Module } from "@nestjs/common";
import { PickingController } from "./picking.controller";
import { PickingEvents } from "./picking.events";
import { PickingService } from "./picking.service";

@Module({
  controllers: [PickingController],
  providers: [PickingService, PickingEvents],
  exports: [PickingService],
})
export class PickingModule {}
