import { Module } from "@nestjs/common";
import { PaymentProviderModule } from "./payment-provider.module";
import { RefundService } from "./refund.service";

/**
 * Reembolso (SF.3). Isolado p/ ser importado pelo PickingModule sem criar ciclo
 * com MarketplaceModule/PaymentModule. Usa o gateway compartilhado.
 */
@Module({
  imports: [PaymentProviderModule],
  providers: [RefundService],
  exports: [RefundService],
})
export class RefundModule {}
