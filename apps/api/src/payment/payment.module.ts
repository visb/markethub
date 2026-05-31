import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { MarketplaceModule } from "../marketplace/marketplace.module";
import { PaymentController, PaymentWebhookController } from "./payment.controller";
import { PAYMENT_PROVIDER } from "./payment-provider.interface";
import { PaymentService } from "./payment.service";
import { MockPaymentProvider } from "./providers/mock.payment-provider";
import { PagarmePaymentProvider } from "./providers/pagarme.payment-provider";

@Module({
  imports: [MarketplaceModule],
  controllers: [PaymentController, PaymentWebhookController],
  providers: [
    PaymentService,
    // Pagar.me se PAYMENT_PROVIDER=pagarme e houver secret; senão Mock.
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const provider = config.get("PAYMENT_PROVIDER", { infer: true });
        const secret = config.get("PAGARME_SECRET_KEY", { infer: true });
        const log = new Logger("PaymentModule");
        if (provider === "pagarme" && secret) {
          log.log("Using Pagar.me payment provider");
          return new PagarmePaymentProvider(config.get("PAGARME_BASE_URL", { infer: true }), secret);
        }
        log.warn("Using Mock payment provider");
        return new MockPaymentProvider();
      },
    },
  ],
})
export class PaymentModule {}
