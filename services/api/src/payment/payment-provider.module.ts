import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { PAYMENT_PROVIDER } from "./payment-provider.interface";
import { MockPaymentProvider } from "./providers/mock.payment-provider";
import { PagarmePaymentProvider } from "./providers/pagarme.payment-provider";

/**
 * Provê o gateway de pagamento (PAYMENT_PROVIDER) de forma compartilhada para
 * PaymentModule (cobrança) e RefundModule (estorno SF.3), evitando dependência
 * circular entre picking e pagamento.
 */
@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const provider = config.get("PAYMENT_PROVIDER", { infer: true });
        const secret = config.get("PAGARME_SECRET_KEY", { infer: true });
        const log = new Logger("PaymentProviderModule");
        if (provider === "pagarme" && secret) {
          log.log("Using Pagar.me payment provider");
          return new PagarmePaymentProvider(config.get("PAGARME_BASE_URL", { infer: true }), secret);
        }
        log.warn("Using Mock payment provider");
        return new MockPaymentProvider();
      },
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentProviderModule {}
