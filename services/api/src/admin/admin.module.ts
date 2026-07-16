import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module";
import { MarketplaceModule } from "../marketplace";
import { ReviewsModule } from "../reviews/reviews.module";
import { StorageModule } from "../storage/storage.module";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminDashboardSummaryService } from "./admin-dashboard-summary.service";
import { AdminCouponsController } from "./admin-coupons.controller";
import { AdminCouponsService } from "./admin-coupons.service";
import {
  AdminMerchantsController,
  AdminStoreDetailController,
} from "./admin-merchants.controller";
import { AdminMerchantsService } from "./admin-merchants.service";
import { AdminOrdersController } from "./admin-orders.controller";
import { AdminOrderSupportService } from "./admin-order-support.service";

/**
 * Admin (S5.4 + navegação Mercado→Loja): dashboard de pedidos/operação/financeiro
 * e drill-down por mercado/loja com ofertas, estoque e funcionários. Story 67:
 * suporte ao pedido (timeline, cancelamento admin delegado ao marketplace e
 * reembolso manual via evento durável).
 */
@Module({
  imports: [EventsModule, MarketplaceModule, ReviewsModule, StorageModule],
  controllers: [
    AdminDashboardController,
    AdminMerchantsController,
    AdminStoreDetailController,
    AdminCouponsController,
    AdminOrdersController,
  ],
  providers: [
    AdminDashboardService,
    AdminDashboardSummaryService,
    AdminMerchantsService,
    AdminCouponsService,
    AdminOrderSupportService,
  ],
})
export class AdminModule {}
