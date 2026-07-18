import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma, TipTarget } from "@prisma/client";
import type { Env } from "../config/env";
import { PAYMENT_PROVIDER, type PaymentProvider } from "../payment";
import { PrismaService } from "../prisma/prisma.service";

/** Item de gorjeta enviado pelo cliente: alvo + (id do alvo, p/ merchant) + valor. */
export interface TipItemInput {
  target: TipTarget; // platform | driver | merchant
  targetId?: string; // merchant → merchantId; platform/driver dispensam
  amountCents: number;
}

/**
 * Gorjeta individual por alvo (story 77). Uma cobrança PIX por pedido soma os itens
 * (plataforma, entregador e/ou cada mercado do pedido). O `driverId` legado do Tip
 * segue preenchido (nullable) para compatibilidade; o alvo entregador vive num
 * TipItem (target=driver). Estado pending → paid via webhook (PaymentService resolve
 * o Tip por providerChargeId — o status agregado propaga aos itens pela relação).
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
      include: { items: true, order: { select: { userId: true } } },
    });
    if (!tip || tip.order.userId !== userId) {
      throw new NotFoundException({ code: "TIP_NOT_FOUND", message: "Sem gorjeta para o pedido" });
    }
    return toTipView(tip);
  }

  /**
   * Alvos possíveis da gorjeta do pedido (para o app montar as linhas): entregador
   * (só se houve entrega própria) e cada mercado do pedido. Plataforma é sempre válida.
   */
  async targets(userId: string, orderId: string) {
    const order = await this.loadOrder(userId, orderId);
    const { driverId } = this.resolveOrder(order);
    const driver = driverId
      ? order.groups.find((g) => g.delivery?.driverId === driverId)?.delivery?.driver ?? null
      : null;
    const merchants: { merchantId: string; merchantName: string }[] = [];
    const seen = new Set<string>();
    for (const g of order.groups) {
      if (seen.has(g.store.merchantId)) continue;
      seen.add(g.store.merchantId);
      merchants.push({ merchantId: g.store.merchantId, merchantName: g.store.merchant.name });
    }
    return {
      orderId,
      hasDelivery: !!driverId,
      driverName: driver?.name ?? null,
      merchants,
    };
  }

  /** Cria (ou reaproveita) a gorjeta multi-alvo + uma cobrança PIX do total. */
  async create(userId: string, orderId: string, items: TipItemInput[]) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException({ code: "INVALID_TIP_ITEMS", message: "Nenhum item de gorjeta" });
    }

    const order = await this.loadOrder(userId, orderId);
    if (order.status !== "delivered") {
      throw new BadRequestException({
        code: "ORDER_NOT_DELIVERED",
        message: "Só é possível dar gorjeta após a entrega",
      });
    }
    if (order.tip && order.tip.status === "paid") {
      throw new BadRequestException({ code: "TIP_ALREADY_PAID", message: "Gorjeta já paga" });
    }

    const { driverId, merchantIds } = this.resolveOrder(order);
    const rows = this.buildItems(items, driverId, merchantIds);
    const totalCents = rows.reduce((sum, r) => sum + r.amountCents, 0);

    const max = this.config.get("TIP_MAX_CENTS", { infer: true });
    if (totalCents <= 0 || totalCents > max) {
      throw new BadRequestException({ code: "INVALID_TIP_AMOUNT", message: "Valor de gorjeta inválido" });
    }

    const charge = await this.provider.createPixCharge({
      orderId: order.id,
      amountCents: totalCents,
      customer: { name: order.user.name, email: order.user.email },
      expiresInSeconds: this.config.get("PIX_EXPIRES_SECONDS", { infer: true }),
    });

    const itemCreate: Prisma.TipItemCreateWithoutTipInput[] = rows.map((r) => ({
      target: r.target,
      targetDriverId: r.targetDriverId ?? null,
      targetMerchantId: r.targetMerchantId ?? null,
      amountCents: r.amountCents,
    }));
    const base = {
      driverId, // legado/compat — alvo entregador também vira TipItem
      amountCents: totalCents,
      status: "pending" as const,
      provider: this.provider.name,
      providerChargeId: charge.chargeId,
      pixQrCode: charge.qrCode,
      pixQrCodeUrl: charge.qrCodeUrl,
      expiresAt: charge.expiresAt,
    };

    const tip = await this.prisma.tip.upsert({
      where: { orderId },
      create: { orderId, ...base, items: { create: itemCreate } },
      update: { ...base, paidAt: null, items: { deleteMany: {}, create: itemCreate } },
      include: { items: true },
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

  /** Carrega o pedido do dono com grupos (fulfillment, merchant, driver) + tip. */
  private async loadOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { name: true, email: true } },
        groups: {
          select: {
            fulfillment: true,
            store: { select: { merchantId: true, merchant: { select: { name: true } } } },
            delivery: { select: { driverId: true, driver: { select: { name: true } } } },
          },
        },
        tip: { select: { status: true } },
      },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException({ code: "ORDER_NOT_FOUND", message: "Pedido não encontrado" });
    }
    return order;
  }

  /** Extrai o entregador (se houve entrega) e o conjunto de merchants do pedido. */
  private resolveOrder(order: {
    groups: { fulfillment: string; store: { merchantId: string }; delivery: { driverId: string | null } | null }[];
  }) {
    const driverId =
      order.groups
        .map((g) => (g.fulfillment === "delivery" ? g.delivery?.driverId ?? null : null))
        .find((d): d is string => !!d) ?? null;
    const merchantIds = new Set(order.groups.map((g) => g.store.merchantId));
    return { driverId, merchantIds };
  }

  /** Valida e normaliza os itens contra os alvos válidos do pedido. */
  private buildItems(items: TipItemInput[], driverId: string | null, merchantIds: Set<string>) {
    const rows: {
      target: TipTarget;
      targetDriverId?: string;
      targetMerchantId?: string;
      amountCents: number;
    }[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      if (!Number.isInteger(item.amountCents) || item.amountCents <= 0) {
        throw new BadRequestException({ code: "INVALID_TIP_AMOUNT", message: "Valor de gorjeta inválido" });
      }
      if (item.target === "platform") {
        this.assertUnique(seen, "platform");
        rows.push({ target: "platform", amountCents: item.amountCents });
      } else if (item.target === "driver") {
        if (!driverId) {
          throw new BadRequestException({
            code: "TIP_DRIVER_NOT_IN_ORDER",
            message: "Pedido sem entregador para gorjeta",
          });
        }
        this.assertUnique(seen, "driver");
        rows.push({ target: "driver", targetDriverId: driverId, amountCents: item.amountCents });
      } else if (item.target === "merchant") {
        if (!item.targetId || !merchantIds.has(item.targetId)) {
          throw new BadRequestException({
            code: "TIP_MERCHANT_NOT_IN_ORDER",
            message: "Mercado não pertence ao pedido",
          });
        }
        this.assertUnique(seen, `merchant:${item.targetId}`);
        rows.push({ target: "merchant", targetMerchantId: item.targetId, amountCents: item.amountCents });
      } else {
        throw new BadRequestException({ code: "INVALID_TIP_TARGET", message: "Alvo de gorjeta inválido" });
      }
    }
    return rows;
  }

  private assertUnique(seen: Set<string>, key: string) {
    if (seen.has(key)) {
      throw new BadRequestException({ code: "DUPLICATE_TIP_TARGET", message: "Alvo de gorjeta duplicado" });
    }
    seen.add(key);
  }
}

interface TipItemRow {
  target: TipTarget;
  targetDriverId: string | null;
  targetMerchantId: string | null;
  amountCents: number;
}

function toTipView(tip: {
  id: string;
  orderId: string;
  driverId: string | null;
  amountCents: number;
  status: string;
  pixQrCode: string | null;
  pixQrCodeUrl: string | null;
  expiresAt: Date | null;
  paidAt: Date | null;
  items: TipItemRow[];
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
    items: tip.items.map((i) => ({
      target: i.target,
      targetDriverId: i.targetDriverId,
      targetMerchantId: i.targetMerchantId,
      amountCents: i.amountCents,
    })),
  };
}
