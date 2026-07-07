import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Payment } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider.interface";

/**
 * Criação/reuso da cobrança PIX de um pedido (story 46). Extraída do
 * PaymentService p/ ser consumida também pelo handler `gerar-cobranca-pix` do
 * evento `order.created` sem ciclo de módulos (PaymentModule importa
 * MarketplaceModule, que importa EventsModule). Idempotente por construção:
 * cobrança pendente e válida é reaproveitada (short-circuit, além da trava
 * ProcessedEvent do handler); Payment.orderId é @unique (upsert).
 */
@Injectable()
export class PixChargeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Garante a cobrança PIX do pedido: reaproveita a pendente válida ou cria uma
   * nova no gateway. Retorna null quando o pedido não existe ou não está aberto
   * (status ≠ created) — o chamador decide se isso é erro (endpoint /pay) ou
   * no-op (handler assíncrono relendo estado após reentrega tardia).
   */
  async ensureForOrder(orderId: string): Promise<Payment | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true, payment: true },
    });
    if (!order || order.status !== "created") return null;

    // Já existe cobrança pendente e válida → reaproveita (não chama o gateway).
    if (
      order.payment &&
      order.payment.status === "pending" &&
      order.payment.expiresAt &&
      order.payment.expiresAt > new Date()
    ) {
      return order.payment;
    }

    const charge = await this.provider.createPixCharge({
      orderId: order.id,
      amountCents: order.totalCents,
      customer: { name: order.user.name, email: order.user.email },
      expiresInSeconds: this.config.get("PIX_EXPIRES_SECONDS", { infer: true }),
    });

    return this.prisma.payment.upsert({
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
  }
}
