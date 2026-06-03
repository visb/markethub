import { Module } from "@nestjs/common";
import { ReviewsModule } from "../reviews/reviews.module";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";

/** Dashboard admin (S5.4) — agregações de pedidos, operação e financeiro. */
@Module({
  imports: [ReviewsModule],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminModule {}
