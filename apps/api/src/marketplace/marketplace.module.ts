import { Module } from "@nestjs/common";
import { ErpModule } from "../erp/erp.module";
import { PickingModule } from "../picking/picking.module";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { AddressesController } from "./addresses.controller";
import { AddressesService } from "./addresses.service";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";
import { CheckoutController } from "./checkout.controller";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [ErpModule, PickingModule, SchedulingModule],
  controllers: [AddressesController, CartController, CheckoutController, OrdersController],
  providers: [AddressesService, CartService, OrdersService],
  exports: [OrdersService, CartService],
})
export class MarketplaceModule {}
