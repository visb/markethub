import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { OutboxModule } from "../events/outbox.module";
import { PickingModule } from "../picking/picking.module";
import { DeliveryGateway } from "./delivery.gateway";
import { DriverController } from "./driver.controller";
import { DriverService } from "./driver.service";
import { DriverLocationService } from "./driver-location.service";
import { DriverVehicleService } from "./driver-vehicle.service";
import { StoreDeliveryService } from "./store-delivery.service";
import { StoreDeliveriesController } from "./store-deliveries.controller";

@Module({
  imports: [JwtModule.register({}), PickingModule, OutboxModule],
  controllers: [DriverController, StoreDeliveriesController],
  providers: [
    DriverService,
    DriverVehicleService,
    StoreDeliveryService,
    DriverLocationService,
    DeliveryGateway,
  ],
  exports: [DriverService, DriverVehicleService, StoreDeliveryService],
})
export class DriverModule {}
