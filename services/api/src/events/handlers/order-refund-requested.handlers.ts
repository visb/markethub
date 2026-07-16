import { Injectable } from "@nestjs/common";
import { RefundService } from "../../payment";
import type { OrderRefundRequestedPayload } from "../event-types";

/**
 * Side-effect do `order.refund_requested` (story 67) — reembolso manual do
 * suporte/admin. Mesmo padrão durável da 48/54: fila própria com retry/backoff;
 * falha do provider propaga (o job retenta). Idempotente sob reentrega além da
 * trava ProcessedEvent: o RefundComponent é criado com o `componentId` do
 * payload, então reentrega após sucesso faz short-circuit no RefundService.
 *
 * Sem `estornoEsgotado` aqui: o reembolso manual nunca deixa Refund `pending`
 * (registra `processed` junto do resultado do provider) — chamar markFailed no
 * esgotamento poderia derrubar um refund `pending` LEGÍTIMO de outro fluxo
 * (ex.: shortfall em retry). Esgotou = job failed visível na fila; o admin vê o
 * reembolso ausente no detalhe e reemite.
 */
@Injectable()
export class OrderRefundRequestedHandlers {
  constructor(private readonly refund: RefundService) {}

  /** Estorno parcial manual (valor validado contra o teto na emissão). */
  async emitirEstorno(payload: OrderRefundRequestedPayload): Promise<void> {
    await this.refund.issueManualRefund({
      orderId: payload.orderId,
      groupId: payload.groupId,
      amountCents: payload.amountCents,
      componentId: payload.componentId,
      createdById: payload.createdById ?? null,
    });
  }
}
