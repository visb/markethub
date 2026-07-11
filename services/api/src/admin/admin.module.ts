import { Module } from "@nestjs/common";
import { ReviewsModule } from "../reviews/reviews.module";
import { StorageModule } from "../storage/storage.module";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminCouponsController } from "./admin-coupons.controller";
import { AdminCouponsService } from "./admin-coupons.service";
import {
  AdminMerchantsController,
  AdminStoreDetailController,
} from "./admin-merchants.controller";
import { AdminMerchantsService } from "./admin-merchants.service";

/**
 * Admin (S5.4 + navegação Mercado→Loja): dashboard de pedidos/operação/financeiro
 * e drill-down por mercado/loja com ofertas, estoque e funcionários.
 */
@Module({
  imports: [ReviewsModule, StorageModule],
  controllers: [
    AdminDashboardController,
    AdminMerchantsController,
    AdminStoreDetailController,
    AdminCouponsController,
  ],
  providers: [AdminDashboardService, AdminMerchantsService, AdminCouponsService],
})
export class AdminModule {}
