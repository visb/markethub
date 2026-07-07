import { Module } from "@nestjs/common";
import { PaymentProviderModule } from "./payment-provider.module";
import { PixChargeService } from "./pix-charge.service";

/**
 * Cobrança PIX isolada (story 46) p/ ser importada pelo EventsModule (handler
 * `gerar-cobranca-pix` do `order.created`) e pelo PaymentModule sem ciclo com
 * MarketplaceModule. Mesmo racional do RefundModule.
 */
@Module({
  imports: [PaymentProviderModule],
  providers: [PixChargeService],
  exports: [PixChargeService],
})
export class PixChargeModule {}
