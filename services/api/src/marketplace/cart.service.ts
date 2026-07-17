import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { etaMinutes, haversineKm } from "../common/geo";
import { PrismaService } from "../prisma/prisma.service";
import { isCouponRedeemable } from "../shared/coupon-rules";
import {
  computeCart,
  DOOR_SURCHARGE_CENTS,
  type CalcCoupon,
  type CalcGroup,
} from "../shared/pricing";

export interface AddItemInput {
  offerId: string;
  quantity?: number;
  weightGrams?: number | null;
  note?: string | null;
}

/**
 * Cupom disponível no carrinho (story 74). Contrato espelhado em
 * `packages/types` (`availableCouponSchema`) — backend não importa o pacote.
 * `applicable: false` acompanha `reason` discriminável (`MIN_ORDER_NOT_MET`).
 */
export interface AvailableCoupon {
  code: string;
  title: string | null;
  description: string | null;
  type: "fixed" | "percent" | "free_shipping";
  value: number;
  merchantId: string | null;
  minOrderCents: number | null;
  /** Desconto que o cupom daria no carrinho atual (ignora o piso, p/ exibir no card). */
  discountCents: number;
  applicable: boolean;
  reason: { code: "MIN_ORDER_NOT_MET"; missingCents: number } | null;
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /** Garante 1 carrinho por usuário. */
  private async ensureCart(userId: string) {
    return this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async getCart(
    userId: string,
    opts: { doorSurchargeCents?: number; fulfillment?: "delivery" | "pickup" } = {},
  ) {
    const cart = await this.ensureCart(userId);
    const pickup = opts.fulfillment === "pickup";
    // retirada na loja: sem frete nem surcharge de porta
    return this.buildView(cart.id, cart.couponCode, pickup ? 0 : (opts.doorSurchargeCents ?? 0), {
      pickup,
    });
  }

  async addItem(userId: string, input: AddItemInput) {
    const cart = await this.ensureCart(userId);
    const offer = await this.prisma.offer.findUnique({
      where: { id: input.offerId },
      include: { product: true },
    });
    if (!offer || !offer.available) {
      throw new BadRequestException({ code: "OFFER_UNAVAILABLE", message: "Oferta indisponível" });
    }

    const { quantity, weightGrams } = this.normalizeQty(offer.product.saleType, input);

    await this.prisma.cartItem.upsert({
      where: { cartId_offerId: { cartId: cart.id, offerId: input.offerId } },
      update: { quantity, weightGrams, note: input.note ?? null },
      create: {
        cartId: cart.id,
        offerId: input.offerId,
        quantity,
        weightGrams,
        note: input.note ?? null,
      },
    });
    return this.buildView(cart.id, cart.couponCode, 0);
  }

  async updateItem(userId: string, itemId: string, input: Omit<AddItemInput, "offerId">) {
    const cart = await this.ensureCart(userId);
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { offer: { include: { product: true } } },
    });
    if (!item || item.cartId !== cart.id) {
      throw new NotFoundException({ code: "ITEM_NOT_FOUND", message: "Item não encontrado" });
    }
    const { quantity, weightGrams } = this.normalizeQty(item.offer.product.saleType, {
      quantity: input.quantity,
      weightGrams: input.weightGrams,
    });
    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity, weightGrams, note: input.note ?? item.note },
    });
    return this.buildView(cart.id, cart.couponCode, 0);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.ensureCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
    return this.buildView(cart.id, cart.couponCode, 0);
  }

  async clear(userId: string) {
    const cart = await this.ensureCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return this.buildView(cart.id, null, 0);
  }

  async applyCoupon(userId: string, code: string) {
    const cart = await this.ensureCart(userId);
    const coupon = await this.loadValidCoupon(code);
    if (!coupon) throw new BadRequestException({ code: "INVALID_COUPON", message: "Cupom inválido" });
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: code } });
    return this.buildView(cart.id, code, 0);
  }

  async removeCoupon(userId: string) {
    const cart = await this.ensureCart(userId);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return this.buildView(cart.id, null, 0);
  }

  /**
   * Cupons disponíveis para o carrinho atual (story 74): globais + dos merchants
   * presentes no carrinho, resgatáveis agora (ativos/vigentes/não esgotados). Além
   * dos aplicáveis, inclui os que falham SÓ pelo pedido mínimo — marcados
   * `applicable: false` com `MIN_ORDER_NOT_MET` + quanto falta. Expirados, inativos,
   * esgotados e de merchant fora do carrinho não aparecem. Carrinho vazio → lista vazia.
   */
  async availableCoupons(userId: string): Promise<AvailableCoupon[]> {
    const cart = await this.ensureCart(userId);
    const { calcGroups, merchantIds, itemsCents } = await this.loadCartCalc(cart.id);
    if (merchantIds.length === 0) return [];

    const now = new Date();
    const coupons = await this.prisma.coupon.findMany({
      where: { active: true, OR: [{ merchantId: null }, { merchantId: { in: merchantIds } }] },
      orderBy: { createdAt: "desc" },
    });

    const out: AvailableCoupon[] = [];
    for (const c of coupons) {
      // Escopo de merchant (defensivo além do WHERE) e resgate (janela/usos).
      if (c.merchantId && !merchantIds.includes(c.merchantId)) continue;
      if (!isCouponRedeemable(c, now)) continue;

      const calcCoupon: CalcCoupon = {
        type: c.type,
        value: c.value,
        merchantId: c.merchantId,
        minOrderCents: c.minOrderCents,
      };
      // Valor exibido no card: desconto que aplicaria no carrinho ignorando o piso,
      // para mostrar "você economiza R$ X" mesmo no cupom "quase-lá".
      const discountCents = computeCart(calcGroups, {
        coupon: { ...calcCoupon, minOrderCents: null },
      }).discountCents;

      const min = c.minOrderCents;
      const belowMin = min != null && min > 0 && itemsCents < min;
      out.push({
        code: c.code,
        title: c.title,
        description: c.description,
        type: c.type,
        value: c.value,
        merchantId: c.merchantId,
        minOrderCents: c.minOrderCents,
        discountCents,
        applicable: !belowMin,
        reason: belowMin ? { code: "MIN_ORDER_NOT_MET", missingCents: min - itemsCents } : null,
      });
    }
    return out;
  }

  /**
   * Grupos de cálculo do carrinho (subtotais por merchant) reaproveitando a
   * precificação pura — usado pela elegibilidade de cupons sem montar a visão inteira.
   */
  private async loadCartCalc(
    cartId: string,
  ): Promise<{ calcGroups: CalcGroup[]; merchantIds: string[]; itemsCents: number }> {
    const items = await this.prisma.cartItem.findMany({
      where: { cartId },
      include: {
        offer: {
          include: {
            product: { select: { saleType: true } },
            store: { include: { merchant: true } },
          },
        },
      },
    });

    const byMerchant = new Map<string, typeof items>();
    for (const it of items) {
      const mid = it.offer.store.merchantId;
      if (!byMerchant.has(mid)) byMerchant.set(mid, []);
      byMerchant.get(mid)!.push(it);
    }

    const calcGroups: CalcGroup[] = [...byMerchant.entries()].map(([mid, its]) => {
      const st = its[0]!.offer.store;
      const merchant = st.merchant;
      const effectiveDeliveryFeeCents = st.deliveryFeeCents ?? merchant.deliveryFeeCents;
      return {
        merchantId: mid,
        deliveryFeeCents: effectiveDeliveryFeeCents,
        prepFeeCents: merchant.prepFeeCents,
        platformFeeBps: merchant.platformFeeBps,
        items: its.map((it) => ({
          saleType: it.offer.product.saleType,
          unitPriceCents: it.offer.promoPriceCents ?? it.offer.priceCents,
          quantity: it.quantity,
          weightGrams: it.weightGrams,
        })),
      };
    });

    const itemsCents = computeCart(calcGroups).itemsCents;
    return { calcGroups, merchantIds: [...byMerchant.keys()], itemsCents };
  }

  // ─── montagem da visão + totais ───
  async buildView(
    cartId: string,
    couponCode: string | null,
    doorSurchargeCents: number,
    opts: { pickup?: boolean } = {},
  ) {
    const items = await this.prisma.cartItem.findMany({
      where: { cartId },
      include: {
        offer: {
          include: {
            product: {
              select: {
                id: true,
                gtin: true,
                name: true,
                imageUrl: true,
                saleType: true,
                packageSize: true,
              },
            },
            store: { include: { merchant: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Agrupa por merchant.
    const byMerchant = new Map<string, typeof items>();
    for (const it of items) {
      const mid = it.offer.store.merchantId;
      if (!byMerchant.has(mid)) byMerchant.set(mid, []);
      byMerchant.get(mid)!.push(it);
    }

    const calcGroups: CalcGroup[] = [];
    const groupStores: {
      storeId: string;
      latitude: number | null;
      longitude: number | null;
      avgPrepMinutes: number;
    }[] = [];
    const viewGroups = [...byMerchant.entries()].map(([mid, its]) => {
      const st = its[0]!.offer.store;
      groupStores.push({
        storeId: st.id,
        latitude: st.latitude,
        longitude: st.longitude,
        avgPrepMinutes: st.avgPrepMinutes,
      });
      const merchant = its[0]!.offer.store.merchant;
      // Taxa efetiva do grupo (story 58): override da loja tem prioridade sobre a
      // tarifa da rede; retirada na loja não cobra frete. Pedido mínimo é só da loja
      // (a rede não tem mínimo): `null` = sem mínimo.
      const effectiveDeliveryFeeCents = st.deliveryFeeCents ?? merchant.deliveryFeeCents;
      const minOrderCents = st.minOrderCents;
      calcGroups.push({
        merchantId: mid,
        deliveryFeeCents: opts.pickup ? 0 : effectiveDeliveryFeeCents,
        prepFeeCents: merchant.prepFeeCents,
        platformFeeBps: merchant.platformFeeBps,
        items: its.map((it) => ({
          saleType: it.offer.product.saleType,
          unitPriceCents: it.offer.promoPriceCents ?? it.offer.priceCents,
          quantity: it.quantity,
          weightGrams: it.weightGrams,
        })),
      });
      return {
        merchantId: mid,
        merchant: merchant.name,
        merchantLogoUrl: merchant.logoUrl,
        // Rede suspensa (story 69): flag de aviso por grupo — o app sinaliza e o
        // checkout bloqueia (MERCHANT_SUSPENDED); os itens seguem no carrinho.
        merchantSuspended: !merchant.active,
        storeId: its[0]!.offer.storeId,
        // Config de entrega por loja exposta ao carrinho (story 58).
        deliveryFeeCents: opts.pickup ? 0 : effectiveDeliveryFeeCents,
        minOrderCents,
        allowsPickup: st.allowsPickup,
        items: its.map((it) => ({
          id: it.id,
          offerId: it.offerId,
          productId: it.offer.product.id,
          gtin: it.offer.product.gtin,
          name: it.offer.product.name,
          imageUrl: it.offer.product.imageUrl,
          saleType: it.offer.product.saleType,
          packageSize: it.offer.product.packageSize,
          unitPriceCents: it.offer.promoPriceCents ?? it.offer.priceCents,
          quantity: it.quantity,
          weightGrams: it.weightGrams,
          available: it.offer.available,
          note: it.note,
        })),
      };
    });

    const coupon = couponCode ? await this.loadValidCoupon(couponCode) : null;
    const totals = computeCart(calcGroups, { coupon, doorSurchargeCents });
    const etaByStore = await this.groupEta(cartId, groupStores);

    const subtotalByMerchant = new Map(totals.groups.map((g) => [g.merchantId, g.subtotalCents]));
    return {
      couponCode,
      // Cupom aplicado com título/descrição legíveis (story 73); null quando não
      // há cupom válido. O app cliente consome estes campos na story 74.
      appliedCoupon: coupon
        ? { code: coupon.code, title: coupon.title, description: coupon.description }
        : null,
      itemCount: items.length,
      groups: viewGroups.map((g) => {
        // Progresso rumo ao pedido mínimo da loja (story 58): 0 quando não há
        // mínimo ou já foi atingido.
        const subtotal = subtotalByMerchant.get(g.merchantId) ?? 0;
        const missingForMinCents =
          g.minOrderCents != null ? Math.max(0, g.minOrderCents - subtotal) : 0;
        return {
          ...g,
          etaMinutes: etaByStore.get(g.storeId)?.etaMinutes ?? null,
          distanceKm: etaByStore.get(g.storeId)?.distanceKm ?? null,
          missingForMinCents,
        };
      }),
      totals,
    };
  }

  /**
   * ETA real por mercado (S6.7): preparo da loja + deslocamento até o endereço
   * padrão do dono do carrinho. Sem coordenadas → distância null e ETA só de preparo.
   */
  private async groupEta(
    cartId: string,
    stores: { storeId: string; latitude: number | null; longitude: number | null; avgPrepMinutes: number }[],
  ): Promise<Map<string, { etaMinutes: number; distanceKm: number | null }>> {
    const cart = await this.prisma.cart.findUnique({ where: { id: cartId }, select: { userId: true } });
    const addr = cart
      ? await this.prisma.address.findFirst({
          where: { userId: cart.userId, isDefault: true },
          select: { latitude: true, longitude: true },
        })
      : null;
    const out = new Map<string, { etaMinutes: number; distanceKm: number | null }>();
    for (const s of stores) {
      const hasGeo =
        addr?.latitude != null && addr.longitude != null && s.latitude != null && s.longitude != null;
      const distanceKm = hasGeo
        ? Math.round(haversineKm(addr.latitude!, addr.longitude!, s.latitude!, s.longitude!) * 10) / 10
        : null;
      out.set(s.storeId, { etaMinutes: etaMinutes(s.avgPrepMinutes, distanceKm ?? 0), distanceKm });
    }
    return out;
  }

  private normalizeQty(
    saleType: "unit" | "weight",
    input: { quantity?: number; weightGrams?: number | null },
  ): { quantity: number; weightGrams: number | null } {
    if (saleType === "weight") {
      const grams = Math.trunc(input.weightGrams ?? 0);
      if (grams <= 0) {
        throw new BadRequestException({
          code: "WEIGHT_REQUIRED",
          message: "Produto por peso requer weightGrams > 0",
        });
      }
      return { quantity: 1, weightGrams: grams };
    }
    const qty = Math.trunc(input.quantity ?? 1);
    if (qty <= 0) {
      throw new BadRequestException({ code: "QTY_REQUIRED", message: "Quantidade deve ser > 0" });
    }
    return { quantity: qty, weightGrams: null };
  }

  private async loadValidCoupon(
    code: string,
  ): Promise<(CalcCoupon & { code: string; title: string | null; description: string | null }) | null> {
    const c = await this.prisma.coupon.findUnique({ where: { code } });
    // Resgate (ativo/vigente/não esgotado): regra única compartilhada (story 74).
    if (!c || !isCouponRedeemable(c)) return null;
    return {
      type: c.type,
      value: c.value,
      merchantId: c.merchantId,
      minOrderCents: c.minOrderCents,
      // Título/descrição legíveis expostos no carrinho (story 73); cupom legado
      // sem título segue aplicável (title null).
      code: c.code,
      title: c.title,
      description: c.description,
    };
  }

  static get DOOR_SURCHARGE_CENTS() {
    return DOOR_SURCHARGE_CENTS;
  }
}
