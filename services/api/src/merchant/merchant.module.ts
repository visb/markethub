import { Module } from "@nestjs/common";
import { GeocodingModule } from "../geocoding/geocoding.module";
import { StorageModule } from "../storage/storage.module";
import { UsersModule } from "../users/users.module";
import { MerchantContextController } from "./merchant-context.controller";
import { MerchantOrdersController } from "./merchant-orders.controller";
import { MerchantProductService } from "./merchant-product.service";
import { MerchantReportsController } from "./merchant-reports.controller";
import { MerchantReportsService } from "./merchant-reports.service";
import { MerchantStaffController } from "./merchant-staff.controller";
import { MerchantStaffService } from "./merchant-staff.service";
import { MerchantVehiclesController } from "./merchant-vehicles.controller";
import { MerchantVehiclesService } from "./merchant-vehicles.service";
import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";

@Module({
  imports: [StorageModule, GeocodingModule, UsersModule],
  controllers: [
    MerchantContextController,
    MerchantStaffController,
    MerchantVehiclesController,
    MerchantOrdersController,
    MerchantReportsController,
    MerchantController,
  ],
  providers: [
    MerchantService,
    MerchantProductService,
    MerchantStaffService,
    MerchantVehiclesService,
    MerchantReportsService,
  ],
  exports: [MerchantService],
})
export class MerchantModule {}
