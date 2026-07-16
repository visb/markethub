import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { RefundReason } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider.interface";
import { itemShortfall } from "./refund.pricing";

/**
 * Orquestra o reembolso único por pedido (SF.3). Quando todas as separações do
 * pedido concluem, consolida as faltas (peso menor que o pedido + itens recusados)
 * de todos os grupos e emite 1 estorno via gateway. Idempotente.
 *
 * Story 48 (estorno durável): a falha do provider PROPAGA em vez de cravar
 * `failed` — quem chama são handlers de evento em fila BullMQ com retry/backoff
 * (ver events/subscriptions.ts + outbox-relay), e o erro propagado é o que faz o
 * job retentar. `failed` só é gravado no ESGOTAMENTO dos retries (markFailed,
 * chamado pelo listener de job failed definitivo do processor). Um Refund
 * `pending` deixado por tentativa anterior é RETOMADO (reprocessa no gateway) —
 * não é recriado (unique orderId). Corrida do unique na criação continua
 * short-circuit silencioso: é o caminho idempotente, não erro.
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
    if (!order) return;
    if (order.refund && order.refund.status !== "pending") return; // já processado/esgotado
    if (!order.payment || order.payment.status !== "paid") return;

    // retomada: refund pendente de tentativa anterior (provider falhou) — só reprocessa
    if (order.refund) {
      await this.processAtProvider(order.refund, order.payment.providerChargeId ?? "");
      return;
    }

    const amountCents = order.payment.amountCents;
    const refund = await this.createRefund({
      orderId,
      amountCents,
      status: "pending",
      provider: order.payment.provider,
      reason: "customer_cancel",
    });
    if (!refund) return; // corrida do unique — outro fluxo já criou

    await this.processAtProvider(refund, order.payment.providerChargeId ?? "");
    this.logger.log(`Estorno integral de ${amountCents}c p/ pedido cancelado ${orderId}`);
  }

  /**
   * Estorno PARCIAL ao cancelar UM sub-pedido (OrderGroup) — story 54. Acumula
   * um `RefundComponent` (reason `group_canceled`) no Refund 1:1 do pedido e
   * dispara o estorno do valor rateado no gateway. Vários grupos cancelados
   * somam no MESMO Refund (amountCents cresce; components mantêm o breakdown por
   * grupo p/ contábil/repasse).
   *
   * Idempotência (BullMQ entrega at-least-once; a trava ProcessedEvent do handler
   * garante 1 execução por evento): a presença de um RefundComponent
   * `group_canceled` para este grupo marca "já estornado" → no-op. O componente é
   * gravado junto com o resultado do provider, então uma reentrega após sucesso
   * completo faz short-circuit. Cancelamento de grupo só acontece antes da
   * separação (invariante) — não há componente de shortfall do mesmo grupo p/
   * confundir. Falha do provider PROPAGA (job retenta); só o esgotamento marca
   * `failed` (markFailed).
   */
  async issueGroupCancelRefund(
    orderId: string,
    groupId: string,
    amountCents: number,
    reason: string,
  ): Promise<void> {
    if (amountCents <= 0) return;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, refund: { include: { components: true } } },
    });
    if (!order) return;
    if (!order.payment || order.payment.status !== "paid") return; // só estorna pedido pago

    // já estornado este grupo? (component group_canceled do grupo) → no-op idempotente
    const already = order.refund?.components.some(
      (c) => c.orderGroupId === groupId && c.reason === "group_canceled",
    );
    if (already) return;

    // estorno parcial no gateway ANTES de registrar o componente (o componente é
    // a marca de "processado" p/ a reentrega fazer short-circuit).
    const result = await this.provider.refund({
      chargeId: order.payment.providerChargeId ?? "",
      amountCents,
      reason,
    });

    await this.prisma.$transaction(async (tx) => {
      if (order.refund) {
        await tx.refund.update({
          where: { id: order.refund.id },
          data: {
            amountCents: { increment: amountCents },
            status: "processed",
            providerRefundId: result.refundId,
            processedAt: new Date(),
            components: {
              create: { orderGroupId: groupId, amountCents, reason: "group_canceled" },
            },
          },
        });
      } else {
        await tx.refund.create({
          data: {
            orderId,
            amountCents,
            status: "processed",
            provider: order.payment!.provider,
            reason,
            providerRefundId: result.refundId,
            processedAt: new Date(),
            components: {
              create: { orderGroupId: groupId, amountCents, reason: "group_canceled" },
            },
          },
        });
      }
    });
    this.logger.log(`Estorno parcial de ${amountCents}c (grupo ${groupId} cancelado) p/ pedido ${orderId}`);
  }

  /**
   * Estorno PARCIAL manual do suporte/admin (story 67) — handler do evento
   * `order.refund_requested`. Acumula um `RefundComponent` (reason `manual`,
   * `createdById` = admin) no Refund 1:1 do pedido e dispara o estorno do valor
   * arbitrário no gateway — mesmo mecanismo durável da 48/54 (retry via BullMQ;
   * falha do provider PROPAGA).
   *
   * Idempotência: `componentId` vem no payload (gerado na emissão) — o
   * componente é gravado com ESSE id junto do resultado do provider, então a
   * reentrega após sucesso faz short-circuit pela presença dele (vários
   * reembolsos manuais do MESMO grupo são permitidos; a marca é por evento, não
   * por grupo). O teto (pago − já reembolsado) é validado na emissão (admin
   * service); aqui há um guard defensivo que loga e ignora se o estado mudou
   * entre a emissão e o processamento.
   */
  async issueManualRefund(input: {
    orderId: string;
    groupId: string;
    amountCents: number;
    componentId: string;
    createdById: string | null;
  }): Promise<void> {
    if (input.amountCents <= 0) return;
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      include: { payment: true, refund: { include: { components: true } } },
    });
    if (!order) return;
    if (!order.payment || order.payment.status !== "paid") return; // só estorna pedido pago

    // já processado ESTE pedido de reembolso? (component com o id do evento) → no-op
    if (order.refund?.components.some((c) => c.id === input.componentId)) return;

    // guard defensivo do teto (a validação principal é na emissão)
    const refundedCents =
      order.refund && order.refund.status !== "failed" ? order.refund.amountCents : 0;
    if (input.amountCents > order.payment.amountCents - refundedCents) {
      this.logger.warn(
        `Reembolso manual de ${input.amountCents}c excede o teto do pedido ${input.orderId} — ignorado`,
      );
      return;
    }

    // estorno no gateway ANTES de registrar o componente (o componente com o
    // componentId é a marca de "processado" p/ a reentrega fazer short-circuit).
    const result = await this.provider.refund({
      chargeId: order.payment.providerChargeId ?? "",
      amountCents: input.amountCents,
      reason: "manual",
    });

    const component = {
      id: input.componentId,
      orderGroupId: input.groupId,
      amountCents: input.amountCents,
      reason: "manual" as const,
      createdById: input.createdById,
    };
    await this.prisma.$transaction(async (tx) => {
      if (order.refund) {
        await tx.refund.update({
          where: { id: order.refund.id },
          data: {
            amountCents: { increment: input.amountCents },
            status: "processed",
            providerRefundId: result.refundId,
            processedAt: new Date(),
            components: { create: component },
          },
        });
      } else {
        await tx.refund.create({
          data: {
            orderId: input.orderId,
            amountCents: input.amountCents,
            status: "processed",
            provider: order.payment!.provider,
            reason: "manual",
            providerRefundId: result.refundId,
            processedAt: new Date(),
            components: { create: component },
          },
        });
      }
    });
    this.logger.log(
      `Estorno manual de ${input.amountCents}c (grupo ${input.groupId}) p/ pedido ${input.orderId}`,
    );
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
    if (order.refund && order.refund.status !== "pending") return; // idempotente: já há reembolso
    if (!order.payment || order.payment.status !== "paid") return; // só estorna pedido pago

    // retomada: refund pendente de tentativa anterior (provider falhou) — só reprocessa
    if (order.refund) {
      await this.processAtProvider(order.refund, order.payment.providerChargeId ?? "");
      return;
    }

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

    const reason = [...new Set(components.map((c) => c.reason))].join("+");
    // Cria o reembolso (unique orderId garante 1 por pedido / idempotência sob corrida).
    const refund = await this.createRefund({
      orderId,
      amountCents: refundCents,
      status: "pending",
      provider: order.payment.provider,
      reason,
      components: {
        create: components.map((c) => ({
          orderGroupId: c.orderGroupId,
          amountCents: c.amountCents,
          reason: c.reason,
        })),
      },
    });
    if (!refund) return; // corrida do unique — outro fluxo já criou

    await this.processAtProvider(refund, order.payment.providerChargeId ?? "");
    this.logger.log(`Reembolso de ${refundCents}c processado p/ pedido ${orderId}`);
  }

  /**
   * Esgotamento dos retries do estorno (story 48): marca `failed` para o estado
   * do domínio ficar auditável — só toca refund ainda `pending` (não sobrescreve
   * um `processed` que tenha vencido a corrida na última tentativa).
   */
  async markFailed(orderId: string): Promise<void> {
    const { count } = await this.prisma.refund.updateMany({
      where: { orderId, status: "pending" },
      data: { status: "failed" },
    });
    if (count > 0) {
      this.logger.error(`Estorno do pedido ${orderId} esgotou os retries — marcado failed`);
    }
  }

  /**
   * Cria a row do Refund. Violação do unique(orderId) (corrida com outro fluxo)
   * → null (caminho idempotente, sem erro); qualquer outra falha propaga (o job
   * retenta).
   */
  private async createRefund(data: Prisma.RefundUncheckedCreateInput) {
    try {
      return await this.prisma.refund.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        this.logger.warn(`Reembolso já existe p/ pedido ${data.orderId} (corrida) — ignorando`);
        return null;
      }
      throw e;
    }
  }

  /**
   * Processa o estorno no gateway e marca `processed`. Falha do provider
   * PROPAGA (sem catch) — o retry/backoff é do BullMQ; `failed` só no
   * esgotamento (markFailed).
   */
  private async processAtProvider(
    refund: { id: string; amountCents: number; reason: string },
    chargeId: string,
  ): Promise<void> {
    const result = await this.provider.refund({
      chargeId,
      amountCents: refund.amountCents,
      reason: refund.reason,
    });
    await this.prisma.refund.update({
      where: { id: refund.id },
      data: { status: "processed", providerRefundId: result.refundId, processedAt: new Date() },
    });
  }
}
