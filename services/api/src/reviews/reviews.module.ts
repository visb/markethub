import { Module } from "@nestjs/common";
import { PaymentProviderModule } from "../payment/payment-provider.module";
import { ReviewsAggregateService } from "./reviews-aggregate.service";
import { ReviewsManagementService } from "./reviews-management.service";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";
import { StoreReviewsController } from "./store-reviews.controller";
import { TipsService } from "./tips.service";

/**
 * Avaliações multi-eixo e gorjeta (S5.2). Gorjeta reusa o PAYMENT_PROVIDER
 * (mock/Pagar.me). Agregações expostas p/ o dashboard admin (S5.4). Vitrine
 * pública + resposta do lojista (story 56) via ReviewsManagementService.
 */
@Module({
  imports: [PaymentProviderModule],
  controllers: [ReviewsController, StoreReviewsController],
  providers: [ReviewsService, TipsService, ReviewsAggregateService, ReviewsManagementService],
  exports: [ReviewsAggregateService, ReviewsManagementService],
})
export class ReviewsModule {}
