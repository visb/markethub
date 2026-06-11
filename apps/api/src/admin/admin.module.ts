import { Module } from "@nestjs/common";
import { ReviewsModule } from "../reviews/reviews.module";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
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
  imports: [ReviewsModule],
  controllers: [AdminDashboardController, AdminMerchantsController, AdminStoreDetailController],
  providers: [AdminDashboardService, AdminMerchantsService],
})
export class AdminModule {}
