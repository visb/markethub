import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payment/payment-provider.interface";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Gorjeta ao entregador (S5.2). O driverId vem da Delivery do pedido (entrega
 * própria). Cobrança PIX via PaymentProvider; estado pending → paid via webhook
 * (PaymentService resolve o Tip por providerChargeId). Uma gorjeta por pedido.
 */
@Injectable()
export class TipsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async get(userId: string, orderId: string) {
    const tip = await this.prisma.tip.findUnique({
      where: { orderId },
      include: { order: { select: { userId: true } } },
    });
    if (!tip || tip.order.userId !== userId) {
      throw new NotFoundException({ code: "TIP_NOT_FOUND", message: "Sem gorjeta para o pedido" });
    }
    return toTipView(tip);
  }

  /** Cria (ou reaproveita) a gorjeta + cobrança PIX. */
  async create(userId: string, orderId: string, amountCents: number) {
    const max = this.config.get("TIP_MAX_CENTS", { infer: true });
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > max) {
      throw new BadRequestException({ code: "INVALID_TIP_AMOUNT", message: "Valor de gorjeta inválido" });
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { name: true, email: true } },
        groups: { select: { fulfillment: true, delivery: { select: { driverId: true } } } },
        tip: true,
      },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado" });
    }
    if (order.status !== "delivered") {
      throw new BadRequestException({
        code: "ORDER_NOT_DELIVERED",
        message: "Só é possível dar gorjeta após a entrega",
      });
    }
    if (order.tip && order.tip.status === "paid") {
      throw new BadRequestException({ code: "TIP_ALREADY_PAID", message: "Gorjeta já paga" });
    }

    const driverId = order.groups
      .map((g) => (g.fulfillment === "delivery" ? g.delivery?.driverId ?? null : null))
      .find((d): d is string => !!d);
    if (!driverId) {
      throw new BadRequestException({
        code: "NO_DRIVER",
        message: "Pedido sem entregador para gorjeta",
      });
    }

    const charge = await this.provider.createPixCharge({
      orderId: order.id,
      amountCents,
      customer: { name: order.user.name, email: order.user.email },
      expiresInSeconds: this.config.get("PIX_EXPIRES_SECONDS", { infer: true }),
    });

    const tip = await this.prisma.tip.upsert({
      where: { orderId },
      create: {
        orderId,
        driverId,
        amountCents,
        status: "pending",
        provider: this.provider.name,
        providerChargeId: charge.chargeId,
        pixQrCode: charge.qrCode,
        pixQrCodeUrl: charge.qrCodeUrl,
        expiresAt: charge.expiresAt,
      },
      update: {
        driverId,
        amountCents,
        status: "pending",
        provider: this.provider.name,
        providerChargeId: charge.chargeId,
        pixQrCode: charge.qrCode,
        pixQrCodeUrl: charge.qrCodeUrl,
        expiresAt: charge.expiresAt,
        paidAt: null,
      },
    });
    return toTipView(tip);
  }

  /** Dev: simula pagamento da gorjeta (apenas provider mock). */
  async mockPay(userId: string, orderId: string) {
    if (this.provider.name !== "mock") {
      throw new BadRequestException({ code: "NOT_MOCK", message: "Disponível só com provider mock" });
    }
    const tip = await this.prisma.tip.findUnique({
      where: { orderId },
      include: { order: { select: { userId: true } } },
    });
    if (!tip || tip.order.userId !== userId) {
      throw new NotFoundException({ code: "TIP_NOT_FOUND", message: "Sem gorjeta" });
    }
    await this.prisma.tip.update({
      where: { orderId },
      data: { status: "paid", paidAt: new Date() },
    });
    return { handled: true };
  }
}

function toTipView(tip: {
  id: string;
  orderId: string;
  driverId: string;
  amountCents: number;
  status: string;
  pixQrCode: string | null;
  pixQrCodeUrl: string | null;
  expiresAt: Date | null;
  paidAt: Date | null;
}) {
  return {
    id: tip.id,
    orderId: tip.orderId,
    driverId: tip.driverId,
    amountCents: tip.amountCents,
    status: tip.status,
    qrCode: tip.pixQrCode,
    qrCodeUrl: tip.pixQrCodeUrl,
    expiresAt: tip.expiresAt?.toISOString() ?? null,
    paidAt: tip.paidAt?.toISOString() ?? null,
  };
}
