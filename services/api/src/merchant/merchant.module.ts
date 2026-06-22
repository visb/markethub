import { Module } from "@nestjs/common";
import { GeocodingModule } from "../geocoding/geocoding.module";
import { StorageModule } from "../storage/storage.module";
import { UsersModule } from "../users/users.module";
import { MerchantContextController } from "./merchant-context.controller";
import { MerchantProductService } from "./merchant-product.service";
import { MerchantStaffController } from "./merchant-staff.controller";
import { MerchantStaffService } from "./merchant-staff.service";
import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";

@Module({
  imports: [StorageModule, GeocodingModule, UsersModule],
  controllers: [MerchantContextController, MerchantStaffController, MerchantController],
  providers: [MerchantService, MerchantProductService, MerchantStaffService],
  exports: [MerchantService],
})
export class MerchantModule {}
