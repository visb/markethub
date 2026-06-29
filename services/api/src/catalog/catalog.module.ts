import { Module } from "@nestjs/common";
import { EnrichmentModule } from "../enrichment/enrichment.module";
import { StoreFollowsModule } from "../store-follows/store-follows.module";
import { AdminCatalogController } from "./admin-catalog.controller";
import { AdminCatalogService } from "./admin-catalog.service";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import {
  AdminMarketplaceCategoryController,
  MarketplaceCategoryPublicController,
} from "./marketplace-category.controller";
import { MarketplaceCategoryService } from "./marketplace-category.service";

@Module({
  imports: [EnrichmentModule, StoreFollowsModule],
  controllers: [
    CatalogController,
    AdminCatalogController,
    MarketplaceCategoryPublicController,
    AdminMarketplaceCategoryController,
  ],
  providers: [CatalogService, AdminCatalogService, MarketplaceCategoryService],
  exports: [CatalogService],
})
export class CatalogModule {}
