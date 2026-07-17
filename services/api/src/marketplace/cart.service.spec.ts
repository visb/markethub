import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CartService } from "./cart.service";

/**
 * Story 21: cobertura do CartService — núcleo do carrinho do fluxo de compra.
 * Cobre item unit vs weight (peso em gramas), normalização de quantidade,
 * remoção, recálculo de total via buildView, oferta indisponível, cupom e ETA
 * por loja. Usa prisma fake (sem DB) — buildView é re-consultado a cada mutação,
 * então controla-se cartItem.findMany para refletir o estado esperado.
 */

const MERCHANT = {
  name: "Mercado X",
  logoUrl: "logo.png",
  deliveryFeeCents: 700,
  prepFeeCents: 100,
  platformFeeBps: 1000, // 10%
  // Rede ativa (story 69): buildView deriva merchantSuspended de !active.
  active: true,
};

const STORE = {
  id: "store1",
  storeId: "store1",
  latitude: -25.43,
  longitude: -49.27,
  avgPrepMinutes: 20,
  merchantId: "m1",
  // Config de entrega por loja (story 58): null = herda a tarifa da rede / sem mínimo / sem raio.
  deliveryFeeCents: null as number | null,
  minOrderCents: null as number | null,
  deliveryRadiusKm: null as number | null,
  allowsPickup: true,
  merchant: MERCHANT,
};

/** Monta um item de carrinho com o aninhamento completo que buildView consulta. */
function makeItem(over: {
  id?: string;
  offerId?: string;
  saleType?: "unit" | "weight";
  priceCents?: number;
  promoPriceCents?: number | null;
  quantity?: number;
  weightGrams?: number | null;
  available?: boolean;
  note?: string | null;
  merchantId?: string;
  storeId?: string;
  deliveryFeeCents?: number | null;
  minOrderCents?: number | null;
  deliveryRadiusKm?: number | null;
  allowsPickup?: boolean;
  /** Rede ativa? (story 69) — false simula rede suspensa no grupo. */
  merchantActive?: boolean;
} = {}) {
  const saleType = over.saleType ?? "unit";
  const merchantId = over.merchantId ?? "m1";
  const storeId = over.storeId ?? STORE.id;
  return {
    id: over.id ?? "item1",
    offerId: over.offerId ?? "offer1",
    quantity: over.quantity ?? 2,
    weightGrams: over.weightGrams ?? null,
    note: over.note ?? null,
    createdAt: new Date("2026-06-28T10:00:00Z"),
    offer: {
      storeId,
      available: over.available ?? true,
      priceCents: over.priceCents ?? 1000,
      promoPriceCents: over.promoPriceCents ?? null,
      product: {
        id: "prod1",
        gtin: "789",
        name: "Produto",
        imageUrl: "img.png",
        saleType,
        packageSize: "1un",
      },
      store: {
        ...STORE,
        id: storeId,
        storeId,
        merchantId,
        deliveryFeeCents: over.deliveryFeeCents ?? null,
        minOrderCents: over.minOrderCents ?? null,
        deliveryRadiusKm: over.deliveryRadiusKm ?? null,
        allowsPickup: over.allowsPickup ?? true,
        merchant: { ...MERCHANT, active: over.merchantActive ?? true },
      },
    },
  };
}

function makePrisma(opts: {
  items?: ReturnType<typeof makeItem>[];
  couponCode?: string | null;
  offer?: Record<string, unknown> | null;
  foundItem?: Record<string, unknown> | null;
  coupon?: Record<string, unknown> | null;
  address?: Record<string, unknown> | null;
} = {}) {
  const cartUpsert = jest.fn().mockResolvedValue({ id: "cart1", couponCode: opts.couponCode ?? null });
  const cartUpdate = jest.fn().mockResolvedValue({});
  const cartFindUnique = jest.fn().mockResolvedValue({ userId: "u1" });
  const cartItemUpsert = jest.fn().mockResolvedValue({});
  const cartItemUpdate = jest.fn().mockResolvedValue({});
  const cartItemDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const cartItemFindUnique = jest.fn().mockResolvedValue(opts.foundItem ?? null);
  const cartItemFindMany = jest.fn().mockResolvedValue(opts.items ?? []);
  const offerFindUnique = jest.fn().mockResolvedValue(opts.offer ?? null);
  const couponFindUnique = jest.fn().mockResolvedValue(opts.coupon ?? null);
  const addressFindFirst = jest.fn().mockResolvedValue(opts.address ?? null);

  const prisma = {
    cart: { upsert: cartUpsert, update: cartUpdate, findUnique: cartFindUnique },
    cartItem: {
      upsert: cartItemUpsert,
      update: cartItemUpdate,
      deleteMany: cartItemDeleteMany,
      findUnique: cartItemFindUnique,
      findMany: cartItemFindMany,
    },
    offer: { findUnique: offerFindUnique },
    coupon: { findUnique: couponFindUnique },
    address: { findFirst: addressFindFirst },
  } as never;

  return {
    svc: new CartService(prisma),
    cartUpsert,
    cartUpdate,
    cartItemUpsert,
    cartItemUpdate,
    cartItemDeleteMany,
    cartItemFindUnique,
    cartItemFindMany,
    offerFindUnique,
    couponFindUnique,
    addressFindFirst,
  };
}

describe("CartService.addItem", () => {
  it("item unit: normaliza quantidade e faz upsert", async () => {
    const { svc, offerFindUnique, cartItemUpsert } = makePrisma({
      offer: { id: "offer1", available: true, product: { saleType: "unit" } },
      items: [makeItem({ saleType: "unit", quantity: 3, priceCents: 1000 })],
    });
    const view = await svc.addItem("u1", { offerId: "offer1", quantity: 3 });
    expect(offerFindUnique).toHaveBeenCalledWith({
      where: { id: "offer1" },
      include: { product: true },
    });
    expect(cartItemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ quantity: 3, weightGrams: null }),
      }),
    );
    expect(view.itemCount).toBe(1);
    // subtotal 3000 + frete 700 + preparo 100 + 10% (300)
    expect(view.totals.itemsCents).toBe(3000);
    expect(view.totals.totalCents).toBe(3000 + 700 + 100 + 300);
  });

  it("item weight: usa weightGrams (peso em gramas) e fixa quantity=1", async () => {
    const { svc, cartItemUpsert } = makePrisma({
      offer: { id: "offer1", available: true, product: { saleType: "weight" } },
      items: [makeItem({ saleType: "weight", weightGrams: 500, priceCents: 5000 })],
    });
    const view = await svc.addItem("u1", { offerId: "offer1", weightGrams: 500 });
    expect(cartItemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ quantity: 1, weightGrams: 500 }),
      }),
    );
    // R$50,00/kg × 500g = R$25,00 = 2500
    expect(view.totals.itemsCents).toBe(2500);
  });

  it("oferta inexistente ou indisponível → OFFER_UNAVAILABLE", async () => {
    const indisponivel = makePrisma({ offer: { id: "offer1", available: false, product: { saleType: "unit" } } });
    await expect(indisponivel.svc.addItem("u1", { offerId: "offer1", quantity: 1 })).rejects.toThrow(
      BadRequestException,
    );
    const inexistente = makePrisma({ offer: null });
    await expect(inexistente.svc.addItem("u1", { offerId: "x", quantity: 1 })).rejects.toMatchObject({
      response: { code: "OFFER_UNAVAILABLE" },
    });
  });

  it("weight sem gramas (<=0) → WEIGHT_REQUIRED", async () => {
    const { svc } = makePrisma({
      offer: { id: "offer1", available: true, product: { saleType: "weight" } },
    });
    await expect(svc.addItem("u1", { offerId: "offer1", weightGrams: 0 })).rejects.toMatchObject({
      response: { code: "WEIGHT_REQUIRED" },
    });
  });

  it("unit com quantidade <=0 → QTY_REQUIRED", async () => {
    const { svc } = makePrisma({
      offer: { id: "offer1", available: true, product: { saleType: "unit" } },
    });
    await expect(svc.addItem("u1", { offerId: "offer1", quantity: 0 })).rejects.toMatchObject({
      response: { code: "QTY_REQUIRED" },
    });
  });

  it("unit sem quantidade default = 1", async () => {
    const { svc, cartItemUpsert } = makePrisma({
      offer: { id: "offer1", available: true, product: { saleType: "unit" } },
      items: [makeItem({ saleType: "unit", quantity: 1 })],
    });
    await svc.addItem("u1", { offerId: "offer1" });
    expect(cartItemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ quantity: 1 }) }),
    );
  });

  it("usa promoPriceCents quando presente", async () => {
    const { svc } = makePrisma({
      offer: { id: "offer1", available: true, product: { saleType: "unit" } },
      items: [makeItem({ saleType: "unit", quantity: 2, priceCents: 1000, promoPriceCents: 800 })],
    });
    const view = await svc.addItem("u1", { offerId: "offer1", quantity: 2 });
    expect(view.totals.itemsCents).toBe(1600); // 2 × 800
  });
});

describe("CartService.updateItem", () => {
  it("recalcula total ao alterar quantidade", async () => {
    const { svc, cartItemUpdate } = makePrisma({
      foundItem: { id: "item1", cartId: "cart1", note: "obs", offer: { product: { saleType: "unit" } } },
      items: [makeItem({ saleType: "unit", quantity: 5, priceCents: 1000 })],
    });
    const view = await svc.updateItem("u1", "item1", { quantity: 5 });
    expect(cartItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "item1" }, data: expect.objectContaining({ quantity: 5 }) }),
    );
    expect(view.totals.itemsCents).toBe(5000);
  });

  it("item de outro carrinho → ITEM_NOT_FOUND", async () => {
    const { svc } = makePrisma({
      foundItem: { id: "item1", cartId: "outro", offer: { product: { saleType: "unit" } } },
    });
    await expect(svc.updateItem("u1", "item1", { quantity: 1 })).rejects.toMatchObject({
      response: { code: "ITEM_NOT_FOUND" },
    });
  });

  it("item inexistente → ITEM_NOT_FOUND (NotFoundException)", async () => {
    const { svc } = makePrisma({ foundItem: null });
    await expect(svc.updateItem("u1", "x", { quantity: 1 })).rejects.toThrow(NotFoundException);
  });

  it("note ausente preserva a nota atual do item", async () => {
    const { svc, cartItemUpdate } = makePrisma({
      foundItem: { id: "item1", cartId: "cart1", note: "manter", offer: { product: { saleType: "unit" } } },
      items: [makeItem()],
    });
    await svc.updateItem("u1", "item1", { quantity: 1 });
    expect(cartItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ note: "manter" }) }),
    );
  });
});

describe("CartService.removeItem / clear", () => {
  it("remove item escopado ao carrinho do usuário", async () => {
    const { svc, cartItemDeleteMany } = makePrisma({ items: [] });
    const view = await svc.removeItem("u1", "item1");
    expect(cartItemDeleteMany).toHaveBeenCalledWith({ where: { id: "item1", cartId: "cart1" } });
    expect(view.itemCount).toBe(0);
  });

  it("clear remove todos os itens e zera o cupom", async () => {
    const { svc, cartItemDeleteMany, cartUpdate } = makePrisma({ items: [] });
    const view = await svc.clear("u1");
    expect(cartItemDeleteMany).toHaveBeenCalledWith({ where: { cartId: "cart1" } });
    expect(cartUpdate).toHaveBeenCalledWith({ where: { id: "cart1" }, data: { couponCode: null } });
    expect(view.couponCode).toBeNull();
  });
});

describe("CartService.applyCoupon / removeCoupon", () => {
  const activeCoupon = {
    code: "OFF10",
    active: true,
    type: "percent",
    value: 10,
    merchantId: null,
    minOrderCents: null,
    validFrom: null,
    validTo: null,
    maxUses: null,
    usedCount: 0,
  };

  it("aplica cupom válido e grava no carrinho", async () => {
    const { svc, cartUpdate } = makePrisma({
      coupon: activeCoupon,
      couponCode: "OFF10",
      items: [makeItem({ quantity: 2, priceCents: 1000 })],
    });
    const view = await svc.applyCoupon("u1", "OFF10");
    expect(cartUpdate).toHaveBeenCalledWith({ where: { id: "cart1" }, data: { couponCode: "OFF10" } });
    // 10% de 2000
    expect(view.totals.discountCents).toBe(200);
  });

  it("cupom inexistente → INVALID_COUPON", async () => {
    const { svc } = makePrisma({ coupon: null });
    await expect(svc.applyCoupon("u1", "NOPE")).rejects.toMatchObject({
      response: { code: "INVALID_COUPON" },
    });
  });

  it("cupom inativo → INVALID_COUPON", async () => {
    const { svc } = makePrisma({ coupon: { ...activeCoupon, active: false } });
    await expect(svc.applyCoupon("u1", "OFF10")).rejects.toThrow(BadRequestException);
  });

  it("cupom fora da janela validFrom → inválido", async () => {
    const { svc } = makePrisma({
      coupon: { ...activeCoupon, validFrom: new Date("2999-01-01") },
    });
    await expect(svc.applyCoupon("u1", "OFF10")).rejects.toThrow(BadRequestException);
  });

  it("cupom expirado validTo → inválido", async () => {
    const { svc } = makePrisma({
      coupon: { ...activeCoupon, validTo: new Date("2000-01-01") },
    });
    await expect(svc.applyCoupon("u1", "OFF10")).rejects.toThrow(BadRequestException);
  });

  it("cupom esgotado (usedCount >= maxUses) → inválido", async () => {
    const { svc } = makePrisma({
      coupon: { ...activeCoupon, maxUses: 5, usedCount: 5 },
    });
    await expect(svc.applyCoupon("u1", "OFF10")).rejects.toThrow(BadRequestException);
  });

  it("removeCoupon zera o cupom do carrinho", async () => {
    const { svc, cartUpdate } = makePrisma({ items: [] });
    const view = await svc.removeCoupon("u1");
    expect(cartUpdate).toHaveBeenCalledWith({ where: { id: "cart1" }, data: { couponCode: null } });
    expect(view.couponCode).toBeNull();
  });
});

describe("CartService.getCart / buildView (ETA + agrupamento)", () => {
  it("delivery: aplica doorSurchargeCents no total", async () => {
    const { svc } = makePrisma({ items: [makeItem({ quantity: 1, priceCents: 1000 })] });
    const view = await svc.getCart("u1", { doorSurchargeCents: 400, fulfillment: "delivery" });
    expect(view.totals.doorSurchargeCents).toBe(400);
  });

  it("pickup: zera frete e surcharge de porta", async () => {
    const { svc } = makePrisma({ items: [makeItem({ quantity: 1, priceCents: 1000 })] });
    const view = await svc.getCart("u1", { doorSurchargeCents: 400, fulfillment: "pickup" });
    expect(view.totals.deliveryCents).toBe(0);
    expect(view.totals.doorSurchargeCents).toBe(0);
  });

  it("ETA com geo: calcula distância e minutos quando há endereço padrão", async () => {
    const { svc } = makePrisma({
      items: [makeItem()],
      address: { latitude: -25.5, longitude: -49.3 },
    });
    const view = await svc.getCart("u1", {});
    expect(view.groups[0]!.distanceKm).not.toBeNull();
    expect(view.groups[0]!.etaMinutes).toBeGreaterThan(0);
  });

  it("ETA sem geo: distância null, ETA só de preparo", async () => {
    const { svc } = makePrisma({ items: [makeItem()], address: null });
    const view = await svc.getCart("u1", {});
    expect(view.groups[0]!.distanceKm).toBeNull();
    expect(view.groups[0]!.etaMinutes).toBeGreaterThan(0);
  });

  // ── Config de entrega por loja (story 58) ──

  it("taxa: sem override, herda a tarifa da rede (700)", async () => {
    const { svc } = makePrisma({ items: [makeItem({ quantity: 1, priceCents: 1000 })] });
    const view = await svc.getCart("u1", { fulfillment: "delivery" });
    expect(view.groups[0]!.deliveryFeeCents).toBe(700);
    expect(view.totals.deliveryCents).toBe(700);
  });

  it("taxa: override da loja tem prioridade sobre a rede", async () => {
    const { svc } = makePrisma({
      items: [makeItem({ quantity: 1, priceCents: 1000, deliveryFeeCents: 250 })],
    });
    const view = await svc.getCart("u1", { fulfillment: "delivery" });
    expect(view.groups[0]!.deliveryFeeCents).toBe(250);
    expect(view.totals.deliveryCents).toBe(250);
  });

  it("taxa: override 0 (frete grátis da loja) sobrepõe a rede", async () => {
    const { svc } = makePrisma({
      items: [makeItem({ quantity: 1, priceCents: 1000, deliveryFeeCents: 0 })],
    });
    const view = await svc.getCart("u1", { fulfillment: "delivery" });
    expect(view.groups[0]!.deliveryFeeCents).toBe(0);
  });

  it("taxa: retirada zera o frete mesmo com override da loja", async () => {
    const { svc } = makePrisma({
      items: [makeItem({ quantity: 1, priceCents: 1000, deliveryFeeCents: 250 })],
    });
    const view = await svc.getCart("u1", { fulfillment: "pickup" });
    expect(view.groups[0]!.deliveryFeeCents).toBe(0);
    expect(view.totals.deliveryCents).toBe(0);
  });

  it("mínimo: sem mínimo configurado → missingForMinCents 0", async () => {
    const { svc } = makePrisma({ items: [makeItem({ quantity: 1, priceCents: 1000 })] });
    const view = await svc.getCart("u1", {});
    expect(view.groups[0]!.minOrderCents).toBeNull();
    expect(view.groups[0]!.missingForMinCents).toBe(0);
  });

  it("mínimo: subtotal abaixo do mínimo → missingForMinCents = faltante", async () => {
    // 1×1000 = 1000; mínimo 3000 → faltam 2000
    const { svc } = makePrisma({
      items: [makeItem({ quantity: 1, priceCents: 1000, minOrderCents: 3000 })],
    });
    const view = await svc.getCart("u1", {});
    expect(view.groups[0]!.minOrderCents).toBe(3000);
    expect(view.groups[0]!.missingForMinCents).toBe(2000);
  });

  it("mínimo: subtotal atingido → missingForMinCents 0", async () => {
    // 4×1000 = 4000 ≥ 3000
    const { svc } = makePrisma({
      items: [makeItem({ quantity: 4, priceCents: 1000, minOrderCents: 3000 })],
    });
    const view = await svc.getCart("u1", {});
    expect(view.groups[0]!.missingForMinCents).toBe(0);
  });

  it("mínimo multi-loja: só o grupo abaixo do mínimo aponta faltante", async () => {
    const { svc } = makePrisma({
      items: [
        makeItem({ id: "i1", offerId: "o1", quantity: 1, priceCents: 1000, merchantId: "m1", storeId: "s1", minOrderCents: 3000 }),
        makeItem({ id: "i2", offerId: "o2", quantity: 5, priceCents: 1000, merchantId: "m2", storeId: "s2", minOrderCents: 3000 }),
      ],
    });
    const view = await svc.getCart("u1", {});
    const g1 = view.groups.find((g) => g.merchantId === "m1")!;
    const g2 = view.groups.find((g) => g.merchantId === "m2")!;
    expect(g1.missingForMinCents).toBe(2000); // 1000 < 3000
    expect(g2.missingForMinCents).toBe(0); // 5000 ≥ 3000
  });

  it("agrupa itens por merchant", async () => {
    const { svc } = makePrisma({
      items: [
        makeItem({ id: "a", offerId: "o1", merchantId: "m1", quantity: 1, priceCents: 1000 }),
        makeItem({ id: "b", offerId: "o2", merchantId: "m2", quantity: 1, priceCents: 2000 }),
      ],
    });
    const view = await svc.getCart("u1", {});
    expect(view.groups).toHaveLength(2);
    expect(view.itemCount).toBe(2);
  });

  // Story 69: rede suspensa sinaliza o grupo (o app avisa; o checkout bloqueia).
  it("rede suspensa → merchantSuspended true só no grupo afetado", async () => {
    const { svc } = makePrisma({
      items: [
        makeItem({ id: "a", offerId: "o1", merchantId: "m1", storeId: "s1", merchantActive: false }),
        makeItem({ id: "b", offerId: "o2", merchantId: "m2", storeId: "s2" }),
      ],
    });
    const view = await svc.getCart("u1", {});
    const g1 = view.groups.find((g) => g.merchantId === "m1")!;
    const g2 = view.groups.find((g) => g.merchantId === "m2")!;
    expect(g1.merchantSuspended).toBe(true);
    expect(g2.merchantSuspended).toBe(false);
  });
});

describe("CartService.DOOR_SURCHARGE_CENTS", () => {
  it("expõe o surcharge fixo de entrega na porta", () => {
    expect(CartService.DOOR_SURCHARGE_CENTS).toBe(400);
  });
});
