import { Module } from "@nestjs/common";
import { GeocodingModule } from "../geocoding/geocoding.module";
import { MarketplaceModule } from "../marketplace";
import { ReviewsModule } from "../reviews/reviews.module";
import { StorageModule } from "../storage/storage.module";
import { UsersModule } from "../users/users.module";
import { MerchantContextController } from "./merchant-context.controller";
import { MerchantCouponsController } from "./merchant-coupons.controller";
import { MerchantCouponsService } from "./merchant-coupons.service";
import { MerchantOrdersController } from "./merchant-orders.controller";
import { MerchantProductService } from "./merchant-product.service";
import { MerchantReportsController } from "./merchant-reports.controller";
import { MerchantReportsService } from "./merchant-reports.service";
import { MerchantReviewsController } from "./merchant-reviews.controller";
import { MerchantReviewsService } from "./merchant-reviews.service";
import { MerchantStaffController } from "./merchant-staff.controller";
import { MerchantStaffService } from "./merchant-staff.service";
import { MerchantVehiclesController } from "./merchant-vehicles.controller";
import { MerchantVehiclesService } from "./merchant-vehicles.service";
import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";

@Module({
  imports: [StorageModule, GeocodingModule, UsersModule, MarketplaceModule, ReviewsModule],
  controllers: [
    MerchantContextController,
    MerchantStaffController,
    MerchantVehiclesController,
    MerchantCouponsController,
    MerchantOrdersController,
    MerchantReportsController,
    MerchantReviewsController,
    MerchantController,
  ],
  providers: [
    MerchantService,
    MerchantProductService,
    MerchantStaffService,
    MerchantVehiclesService,
    MerchantCouponsService,
    MerchantReportsService,
    MerchantReviewsService,
  ],
  exports: [MerchantService],
})
export class MerchantModule {}
