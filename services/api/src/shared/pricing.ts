/** Cálculo puro de preços do carrinho/pedido (centavos). Testável sem DB. */

/** Sobretaxa de entrega na porta (+R$4) — usada no checkout e na vitrine. */
export const DOOR_SURCHARGE_CENTS = 400;

export type SaleTypeValue = "unit" | "weight";

export interface CalcItem {
  saleType: SaleTypeValue;
  /** unit: preço por unidade; weight: preço por kg. */
  unitPriceCents: number;
  quantity: number;
  weightGrams?: number | null;
}

export interface CalcGroup {
  merchantId: string;
  items: CalcItem[];
  deliveryFeeCents: number;
  prepFeeCents: number;
  platformFeeBps: number; // basis points (1000 = 10%)
}

export interface CalcCoupon {
  type: "fixed" | "percent" | "free_shipping";
  value: number;
  merchantId?: string | null; // null = global
  minOrderCents?: number | null;
}

export interface GroupTotals {
  merchantId: string;
  subtotalCents: number;
  deliveryCents: number;
  prepCents: number;
  platformFeeCents: number;
}

export interface CartTotals {
  groups: GroupTotals[];
  itemsCents: number;
  deliveryCents: number;
  prepCents: number;
  platformFeeCents: number;
  discountCents: number;
  /** Surcharge de entrega na porta (aplicado uma vez no pedido). */
  doorSurchargeCents: number;
  totalCents: number;
}

/** Total de uma linha respeitando o tipo de venda. Peso é cobrado por kg sobre gramas. */
export function computeItemTotal(item: CalcItem): number {
  if (item.saleType === "weight") {
    const grams = Math.max(0, item.weightGrams ?? 0);
    return Math.round((item.unitPriceCents * grams) / 1000);
  }
  return item.unitPriceCents * Math.max(0, item.quantity);
}

/** Calcula o carrinho completo: por loja + cupom + surcharge de porta. */
export function computeCart(
  groups: CalcGroup[],
  opts: { coupon?: CalcCoupon | null; doorSurchargeCents?: number } = {},
): CartTotals {
  const doorSurchargeCents = Math.max(0, opts.doorSurchargeCents ?? 0);

  const groupTotals: GroupTotals[] = groups.map((g) => {
    const subtotalCents = g.items.reduce((sum, it) => sum + computeItemTotal(it), 0);
    const platformFeeCents = Math.floor((subtotalCents * g.platformFeeBps) / 10000);
    return {
      merchantId: g.merchantId,
      subtotalCents,
      deliveryCents: g.deliveryFeeCents,
      prepCents: g.prepFeeCents,
      platformFeeCents,
    };
  });

  const itemsCents = sum(groupTotals.map((g) => g.subtotalCents));
  const deliveryCents = sum(groupTotals.map((g) => g.deliveryCents));
  const prepCents = sum(groupTotals.map((g) => g.prepCents));
  const platformFeeCents = sum(groupTotals.map((g) => g.platformFeeCents));

  const discountCents = computeDiscount(opts.coupon, groupTotals, deliveryCents, itemsCents);

  const totalCents = Math.max(
    0,
    itemsCents + deliveryCents + prepCents + platformFeeCents + doorSurchargeCents - discountCents,
  );

  return {
    groups: groupTotals,
    itemsCents,
    deliveryCents,
    prepCents,
    platformFeeCents,
    discountCents,
    doorSurchargeCents,
    totalCents,
  };
}

function computeDiscount(
  coupon: CalcCoupon | null | undefined,
  groups: GroupTotals[],
  deliveryCents: number,
  itemsCents: number,
): number {
  if (!coupon) return 0;

  // Escopo: cupom de merchant só conta o subtotal/entrega daquele merchant.
  const scoped = coupon.merchantId
    ? groups.filter((g) => g.merchantId === coupon.merchantId)
    : groups;
  const scopedSubtotal = sum(scoped.map((g) => g.subtotalCents));
  const scopedDelivery = sum(scoped.map((g) => g.deliveryCents));

  if (coupon.minOrderCents && itemsCents < coupon.minOrderCents) return 0;

  switch (coupon.type) {
    case "free_shipping":
      return scopedDelivery;
    case "fixed":
      return Math.min(coupon.value, scopedSubtotal);
    case "percent":
      return Math.floor((scopedSubtotal * coupon.value) / 100);
    default:
      return 0;
  }
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}
