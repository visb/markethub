import { Module } from "@nestjs/common";
import { PaymentProviderModule } from "../payment/payment-provider.module";
import { ReviewsAggregateService } from "./reviews-aggregate.service";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";
import { TipsService } from "./tips.service";

/**
 * Avaliações multi-eixo e gorjeta (S5.2). Gorjeta reusa o PAYMENT_PROVIDER
 * (mock/Pagar.me). Agregações expostas p/ o dashboard admin (S5.4).
 */
@Module({
  imports: [PaymentProviderModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, TipsService, ReviewsAggregateService],
  exports: [ReviewsAggregateService],
})
export class ReviewsModule {}
