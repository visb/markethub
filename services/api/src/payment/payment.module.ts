import { Module } from "@nestjs/common";
import { MarketplaceModule } from "../marketplace/marketplace.module";
import { PaymentController, PaymentWebhookController } from "./payment.controller";
import { PaymentProviderModule } from "./payment-provider.module";
import { PaymentService } from "./payment.service";
import { PixChargeModule } from "./pix-charge.module";

@Module({
  imports: [MarketplaceModule, PaymentProviderModule, PixChargeModule],
  controllers: [PaymentController, PaymentWebhookController],
  providers: [PaymentService],
})
export class PaymentModule {}
