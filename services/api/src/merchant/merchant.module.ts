import { Module } from "@nestjs/common";
import { GeocodingModule } from "../geocoding/geocoding.module";
import { StorageModule } from "../storage/storage.module";
import { MerchantContextController } from "./merchant-context.controller";
import { MerchantProductService } from "./merchant-product.service";
import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";

@Module({
  imports: [StorageModule, GeocodingModule],
  controllers: [MerchantContextController, MerchantController],
  providers: [MerchantService, MerchantProductService],
  exports: [MerchantService],
})
export class MerchantModule {}
