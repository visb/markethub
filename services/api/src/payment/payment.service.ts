import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { OrdersService } from "../marketplace/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type WebhookEvent,
} from "./payment-provider.interface";
import { PixChargeService } from "./pix-charge.service";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly orders: OrdersService,
    private readonly pixCharge: PixChargeService,
  ) {}

  /**
   * Cria (ou retorna) a cobrança PIX do pedido. Desde a story 46 a cobrança
   * costuma já existir (handler `gerar-cobranca-pix` do `order.created`) — aqui
   * fica a validação de posse/estado e o fallback síncrono (reuso/expirada).
   */
  async createPixForOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true, status: true },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado" });
    }
    if (order.status !== "created") {
      throw new BadRequestException({ code: "ORDER_NOT_PAYABLE", message: "Pedido não está aberto" });
    }

    const payment = await this.pixCharge.ensureForOrder(orderId);
    if (!payment) {
      // corrida: pedido deixou de estar aberto entre a checagem e a cobrança
      throw new BadRequestException({ code: "ORDER_NOT_PAYABLE", message: "Pedido não está aberto" });
    }
    return this.view(payment);
  }

  async status(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado" });
    }
    if (!order.payment) {
      throw new NotFoundException({ code: "NO_PAYMENT", message: "Sem cobrança para o pedido" });
    }
    return this.view(order.payment);
  }

  /** Webhook do gateway. Idempotente: marca pago e dispara o fluxo do pedido. */
  async handleWebhook(payload: unknown, signature?: string): Promise<{ handled: boolean }> {
    const event = this.provider.parseWebhook(payload, signature);
    if (!event) return { handled: false };

    const payment = await this.prisma.payment.findFirst({
      where: { providerChargeId: event.chargeId },
    });
    if (!payment) {
      // pode ser cobrança de gorjeta (S5.2): resolve o Tip pelo mesmo chargeId
      const handledTip = await this.settleTipWebhook(event.chargeId, event.status);
      if (!handledTip) {
        this.logger.warn(`webhook: cobrança não encontrada p/ charge ${event.chargeId}`);
      }
      return { handled: handledTip };
    }

    if (event.status === "paid") {
      if (payment.status !== "paid") {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: "paid", paidAt: new Date() },
        });
        await this.orders.markPaid(payment.orderId);
      }
    } else {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: event.status === "expired" ? "expired" : "failed" },
      });
    }
    return { handled: true };
  }

  /** Liquida a gorjeta (S5.2) cobrada pelo mesmo gateway. Idempotente. */
  private async settleTipWebhook(chargeId: string, status: WebhookEvent["status"]): Promise<boolean> {
    const tip = await this.prisma.tip.findFirst({ where: { providerChargeId: chargeId } });
    if (!tip) return false;
    if (status === "paid") {
      if (tip.status !== "paid") {
        await this.prisma.tip.update({
          where: { id: tip.id },
          data: { status: "paid", paidAt: new Date() },
        });
      }
    } else {
      await this.prisma.tip.update({ where: { id: tip.id }, data: { status: "failed" } });
    }
    return true;
  }

  /** Helper de dev: simula pagamento (apenas provider mock). */
  async mockPay(userId: string, orderId: string) {
    if (this.provider.name !== "mock") {
      throw new BadRequestException({ code: "NOT_MOCK", message: "Disponível só com provider mock" });
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order || order.userId !== userId || !order.payment) {
      throw new NotFoundException({ code: "NO_PAYMENT", message: "Sem cobrança" });
    }
    return this.handleWebhook({ chargeId: order.payment.providerChargeId, status: "paid" });
  }

  private view(payment: {
    status: string;
    amountCents: number;
    pixQrCode: string | null;
    pixQrCodeUrl: string | null;
    expiresAt: Date | null;
    paidAt: Date | null;
  }) {
    return {
      status: payment.status,
      amountCents: payment.amountCents,
      qrCode: payment.pixQrCode,
      qrCodeUrl: payment.pixQrCodeUrl,
      expiresAt: payment.expiresAt,
      paidAt: payment.paidAt,
    };
  }
}
