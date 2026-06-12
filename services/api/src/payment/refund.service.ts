import { Inject, Injectable, Logger } from "@nestjs/common";
import type { RefundReason } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider.interface";
import { itemShortfall } from "./refund.pricing";

/**
 * Orquestra o reembolso único por pedido (SF.3). Quando todas as separações do
 * pedido concluem, consolida as faltas (peso menor que o pedido + itens recusados)
 * de todos os grupos e emite 1 estorno via gateway. Idempotente.
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Estorno integral quando o cliente cancela um pedido já pago (antes da
   * separação começar). Idempotente via unique(orderId) do Refund.
   */
  async issueCancelRefund(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, refund: true },
    });
    if (!order || order.refund) return;
    if (!order.payment || order.payment.status !== "paid") return;

    const amountCents = order.payment.amountCents;
    let refundId: string;
    try {
      const refund = await this.prisma.refund.create({
        data: {
          orderId,
          amountCents,
          status: "pending",
          provider: order.payment.provider,
          reason: "customer_cancel",
        },
      });
      refundId = refund.id;
    } catch {
      this.logger.warn(`Reembolso já existe p/ pedido ${orderId} (corrida) — ignorando`);
      return;
    }

    try {
      const result = await this.provider.refund({
        chargeId: order.payment.providerChargeId ?? "",
        amountCents,
        reason: "customer_cancel",
      });
      await this.prisma.refund.update({
        where: { id: refundId },
        data: { status: "processed", providerRefundId: result.refundId, processedAt: new Date() },
      });
      this.logger.log(`Estorno integral de ${amountCents}c p/ pedido cancelado ${orderId}`);
    } catch (e) {
      this.logger.error(`Falha no estorno do cancelamento ${orderId}: ${String(e)}`);
      await this.prisma.refund.update({ where: { id: refundId }, data: { status: "failed" } });
    }
  }

  async maybeIssueRefundForOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        refund: true,
        groups: { include: { pickTask: true, items: { include: { pickItem: true } } } },
      },
    });
    if (!order) return;
    if (order.refund) return; // idempotente: já há reembolso
    if (!order.payment || order.payment.status !== "paid") return; // só estorna pedido pago

    // Gatilho: todas as separações concluídas (packed/ready_for_pickup).
    const allDone =
      order.groups.length > 0 &&
      order.groups.every(
        (g) =>
          g.pickTask &&
          (g.pickTask.status === "packed" || g.pickTask.status === "ready_for_pickup"),
      );
    if (!allDone) return;

    // Faltas por grupo (contábil).
    const components: { orderGroupId: string; amountCents: number; reason: RefundReason }[] = [];
    for (const g of order.groups) {
      for (const oi of g.items) {
        const pi = oi.pickItem;
        if (!pi) continue;
        const sf = itemShortfall({
          saleType: oi.saleType,
          unitPriceCents: oi.unitPriceCents,
          quantity: oi.quantity,
          weightGrams: oi.weightGrams,
          status: pi.status,
          quantityPicked: pi.quantityPicked,
          weightGramsPicked: pi.weightGramsPicked,
          lineTotalCents: oi.lineTotalCents,
        });
        if (sf) {
          components.push({ orderGroupId: g.id, amountCents: sf.amountCents, reason: sf.reason });
        }
      }
    }

    const componentsSum = components.reduce((s, c) => s + c.amountCents, 0);
    // Nunca estorna mais que o pago; sem falta → não cria reembolso.
    const refundCents = Math.min(componentsSum, order.payment.amountCents);
    if (refundCents <= 0 || components.length === 0) return;

    // Cria o reembolso (unique orderId garante 1 por pedido / idempotência sob corrida).
    let refundId: string;
    try {
      const refund = await this.prisma.refund.create({
        data: {
          orderId,
          amountCents: refundCents,
          status: "pending",
          provider: order.payment.provider,
          reason: [...new Set(components.map((c) => c.reason))].join("+"),
          components: {
            create: components.map((c) => ({
              orderGroupId: c.orderGroupId,
              amountCents: c.amountCents,
              reason: c.reason,
            })),
          },
        },
      });
      refundId = refund.id;
    } catch {
      this.logger.warn(`Reembolso já existe p/ pedido ${orderId} (corrida) — ignorando`);
      return;
    }

    // Processa no gateway.
    try {
      const result = await this.provider.refund({
        chargeId: order.payment.providerChargeId ?? "",
        amountCents: refundCents,
        reason: [...new Set(components.map((c) => c.reason))].join("+"),
      });
      await this.prisma.refund.update({
        where: { id: refundId },
        data: {
          status: "processed",
          providerRefundId: result.refundId,
          processedAt: new Date(),
        },
      });
      this.logger.log(`Reembolso de ${refundCents}c processado p/ pedido ${orderId}`);
    } catch (e) {
      this.logger.error(`Falha no estorno do pedido ${orderId}: ${String(e)}`);
      await this.prisma.refund.update({ where: { id: refundId }, data: { status: "failed" } });
    }
  }
}
