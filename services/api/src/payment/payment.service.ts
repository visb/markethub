import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type { Env } from "../config/env";
import { OrdersService } from "../marketplace/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type WebhookEvent,
} from "./payment-provider.interface";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly orders: OrdersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Cria (ou retorna) a cobrança PIX do pedido. */
  async createPixForOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true, payment: true },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado" });
    }
    if (order.status !== "created") {
      throw new BadRequestException({ code: "ORDER_NOT_PAYABLE", message: "Pedido não está aberto" });
    }

    // Já existe cobrança pendente e válida → reaproveita.
    if (
      order.payment &&
      order.payment.status === "pending" &&
      order.payment.expiresAt &&
      order.payment.expiresAt > new Date()
    ) {
      return this.view(order.payment);
    }

    const charge = await this.provider.createPixCharge({
      orderId: order.id,
      amountCents: order.totalCents,
      customer: { name: order.user.name, email: order.user.email },
      expiresInSeconds: this.config.get("PIX_EXPIRES_SECONDS", { infer: true }),
    });

    const payment = await this.prisma.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        provider: this.provider.name,
        providerChargeId: charge.chargeId,
        method: "pix",
        status: "pending",
        amountCents: order.totalCents,
        pixQrCode: charge.qrCode,
        pixQrCodeUrl: charge.qrCodeUrl,
        expiresAt: charge.expiresAt,
        raw: charge.raw as Prisma.InputJsonValue,
      },
      update: {
        provider: this.provider.name,
        providerChargeId: charge.chargeId,
        status: "pending",
        amountCents: order.totalCents,
        pixQrCode: charge.qrCode,
        pixQrCodeUrl: charge.qrCodeUrl,
        expiresAt: charge.expiresAt,
        paidAt: null,
        raw: charge.raw as Prisma.InputJsonValue,
      },
    });
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
