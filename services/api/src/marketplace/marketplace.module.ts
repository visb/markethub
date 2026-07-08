import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module";
import { GeocodingModule } from "../geocoding/geocoding.module";
import { PickingModule } from "../picking/picking.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { AddressesController, CoverageController } from "./addresses.controller";
import { AddressesService } from "./addresses.service";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";
import { CheckoutController } from "./checkout.controller";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [EventsModule, GeocodingModule, PickingModule, SchedulingModule],
  controllers: [
    AddressesController,
    CoverageController,
    CartController,
    CheckoutController,
    OrdersController,
  ],
  providers: [AddressesService, CartService, OrdersService],
  exports: [OrdersService, CartService],
})
export class MarketplaceModule {}
