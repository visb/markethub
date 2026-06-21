import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { MerchantContextController } from "./merchant-context.controller";
import { MerchantProductService } from "./merchant-product.service";
import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";

@Module({
  imports: [StorageModule],
  controllers: [MerchantContextController, MerchantController],
  providers: [MerchantService, MerchantProductService],
  exports: [MerchantService],
})
export class MerchantModule {}
