import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PickingModule } from "../picking/picking.module";
import { DriverController } from "./driver.controller";
import { DriverService } from "./driver.service";
import { StoreDeliveryService } from "./store-delivery.service";
import { StoreDeliveriesController } from "./store-deliveries.controller";

@Module({
  imports: [JwtModule.register({}), PickingModule],
  controllers: [DriverController, StoreDeliveriesController],
  providers: [DriverService, StoreDeliveryService],
  exports: [DriverService, StoreDeliveryService],
})
export class DriverModule {}
