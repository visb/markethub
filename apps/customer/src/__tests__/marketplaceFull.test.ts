import type { ApiClient } from "@markethub/api-client";
import { brl, marketplace } from "../api/marketplace";

/**
 * Story 40 (backfill de cobertura): completa o módulo tipado `src/api/marketplace.ts`
 * cobrindo as chamadas do fluxo de compra (carrinho/checkout/endereços/pedidos)
 * ainda sem teste — método/rota/flags de cada request. ApiClient mockado (sem rede).
 */
function setup() {
  const request = jest.fn().mockResolvedValue({});
  const mkt = marketplace({ request } as unknown as ApiClient);
  return { request, mkt };
}

describe("marketplace api — catálogo", () => {
  it("productDetail busca o produto por id", async () => {
    const { request, mkt } = setup();
    await mkt.productDetail("p1");
    expect(request).toHaveBeenCalledWith("/products/p1");
  });

  it("merchants e stores", async () => {
    const { request, mkt } = setup();
    await mkt.merchants();
    await mkt.stores("m1");
    expect(request).toHaveBeenCalledWith("/merchants");
    expect(request).toHaveBeenCalledWith("/merchants/m1/stores");
  });

  it("categoryFeed sem opts só com pageSize", async () => {
    const { request, mkt } = setup();
    await mkt.categoryFeed("c1");
    expect(request).toHaveBeenCalledWith("/marketplace-categories/c1/feed?pageSize=50");
  });

  it("sections inclui geo + auth opcional", async () => {
    const { request, mkt } = setup();
    await mkt.sections("s1", { lat: -25, lng: -49, radiusKm: 10 });
    expect(request).toHaveBeenCalledWith(
      "/stores/s1/sections?lat=-25&lng=-49&radiusKm=10",
      { auth: true },
    );
  });

  it("categories", async () => {
    const { request, mkt } = setup();
    await mkt.categories();
    expect(request).toHaveBeenCalledWith("/marketplace-categories");
  });
});

describe("marketplace api — carrinho", () => {
  it("getCart faz GET autenticado", async () => {
    const { request, mkt } = setup();
    await mkt.getCart();
    expect(request).toHaveBeenCalledWith("/cart", { auth: true });
  });

  it("addItem por peso manda weightGrams", async () => {
    const { request, mkt } = setup();
    await mkt.addItem({ offerId: "o1", weightGrams: 300 });
    expect(request).toHaveBeenCalledWith("/cart/items", {
      method: "POST",
      auth: true,
      body: { offerId: "o1", weightGrams: 300 },
    });
  });

  it("updateItem faz PATCH autenticado", async () => {
    const { request, mkt } = setup();
    await mkt.updateItem("i1", { quantity: 3 });
    expect(request).toHaveBeenCalledWith("/cart/items/i1", {
      method: "PATCH",
      auth: true,
      body: { quantity: 3 },
    });
  });

  it("applyCoupon / removeCoupon", async () => {
    const { request, mkt } = setup();
    await mkt.applyCoupon("PROMO10");
    await mkt.removeCoupon();
    expect(request).toHaveBeenCalledWith("/cart/coupon", {
      method: "POST",
      auth: true,
      body: { code: "PROMO10" },
    });
    expect(request).toHaveBeenCalledWith("/cart/coupon", { method: "DELETE", auth: true });
  });
});

describe("marketplace api — endereços", () => {
  it("addresses lista autenticado", async () => {
    const { request, mkt } = setup();
    await mkt.addresses();
    expect(request).toHaveBeenCalledWith("/addresses", { auth: true });
  });

  it("addAddress / updateAddress / removeAddress / setDefaultAddress", async () => {
    const { request, mkt } = setup();
    const body = { label: "Casa" };
    await mkt.addAddress(body);
    await mkt.updateAddress("a1", body);
    await mkt.removeAddress("a1");
    await mkt.setDefaultAddress("a1");
    expect(request).toHaveBeenCalledWith("/addresses", { method: "POST", auth: true, body });
    expect(request).toHaveBeenCalledWith("/addresses/a1", { method: "PATCH", auth: true, body });
    expect(request).toHaveBeenCalledWith("/addresses/a1", { method: "DELETE", auth: true });
    expect(request).toHaveBeenCalledWith("/addresses/a1/default", { method: "POST", auth: true });
  });

  it("coverageCities", async () => {
    const { request, mkt } = setup();
    await mkt.coverageCities();
    expect(request).toHaveBeenCalledWith("/coverage/cities");
  });
});

describe("marketplace api — favoritos", () => {
  it("favorites / addFavorite / removeFavorite", async () => {
    const { request, mkt } = setup();
    await mkt.favorites();
    await mkt.addFavorite("o1");
    await mkt.removeFavorite("o1");
    expect(request).toHaveBeenCalledWith("/favorites", { auth: true });
    expect(request).toHaveBeenCalledWith("/favorites", {
      method: "POST",
      auth: true,
      body: { offerId: "o1" },
    });
    expect(request).toHaveBeenCalledWith("/favorites/o1", { method: "DELETE", auth: true });
  });
});

describe("marketplace api — checkout e pedidos", () => {
  it("slots autenticado por loja", async () => {
    const { request, mkt } = setup();
    await mkt.slots("s1");
    expect(request).toHaveBeenCalledWith("/stores/s1/slots", { auth: true });
  });

  it("checkout faz POST com o corpo de fulfillment", async () => {
    const { request, mkt } = setup();
    const body = { fulfillment: "delivery" as const, addressId: "a1", deliveryMethod: "door" as const, deliverySlotId: null };
    await mkt.checkout(body);
    expect(request).toHaveBeenCalledWith("/checkout", { method: "POST", auth: true, body });
  });

  it("orders / order / tracking / cancelOrder", async () => {
    const { request, mkt } = setup();
    await mkt.orders();
    await mkt.order("ord1");
    await mkt.tracking("ord1");
    await mkt.cancelOrder("ord1");
    expect(request).toHaveBeenCalledWith("/orders", { auth: true });
    expect(request).toHaveBeenCalledWith("/orders/ord1", { auth: true });
    expect(request).toHaveBeenCalledWith("/orders/ord1/tracking", { auth: true });
    expect(request).toHaveBeenCalledWith("/orders/ord1/cancel", { method: "POST", auth: true });
  });

  it("substitutions: lista / aprovar / rejeitar", async () => {
    const { request, mkt } = setup();
    await mkt.substitutions("ord1");
    await mkt.approveSubstitution("ord1", "sub1");
    await mkt.rejectSubstitution("ord1", "sub1");
    expect(request).toHaveBeenCalledWith("/orders/ord1/substitutions", { auth: true });
    expect(request).toHaveBeenCalledWith("/orders/ord1/substitutions/sub1/approve", {
      method: "POST",
      auth: true,
    });
    expect(request).toHaveBeenCalledWith("/orders/ord1/substitutions/sub1/reject", {
      method: "POST",
      auth: true,
    });
  });
});

describe("marketplace api — reviews, tip e pagamento", () => {
  it("reviews / createReview", async () => {
    const { request, mkt } = setup();
    await mkt.reviews("ord1");
    await mkt.createReview("ord1", { axis: "platform", rating: 5, comment: "ok" });
    expect(request).toHaveBeenCalledWith("/orders/ord1/reviews", { auth: true });
    expect(request).toHaveBeenCalledWith("/orders/ord1/reviews", {
      method: "POST",
      auth: true,
      body: { axis: "platform", rating: 5, comment: "ok" },
    });
  });

  it("tip / tipTargets / createTip / mockPayTip", async () => {
    const { request, mkt } = setup();
    const items = [{ target: "platform" as const, amountCents: 500 }];
    await mkt.tip("ord1");
    await mkt.tipTargets("ord1");
    await mkt.createTip("ord1", items);
    await mkt.mockPayTip("ord1");
    expect(request).toHaveBeenCalledWith("/orders/ord1/tip", { auth: true });
    expect(request).toHaveBeenCalledWith("/orders/ord1/tip/targets", { auth: true });
    expect(request).toHaveBeenCalledWith("/orders/ord1/tip", {
      method: "POST",
      auth: true,
      body: { items },
    });
    expect(request).toHaveBeenCalledWith("/orders/ord1/tip/mock-pay", { method: "POST", auth: true });
  });

  it("pay / paymentStatus / mockPay", async () => {
    const { request, mkt } = setup();
    await mkt.pay("ord1");
    await mkt.paymentStatus("ord1");
    await mkt.mockPay("ord1");
    expect(request).toHaveBeenCalledWith("/orders/ord1/pay", { method: "POST", auth: true });
    expect(request).toHaveBeenCalledWith("/orders/ord1/payment", { auth: true });
    expect(request).toHaveBeenCalledWith("/orders/ord1/mock-pay", { method: "POST", auth: true });
  });
});

describe("brl", () => {
  it("formata centavos em reais com vírgula", () => {
    expect(brl(0)).toBe("R$ 0,00");
    expect(brl(1234)).toBe("R$ 12,34");
    expect(brl(100)).toBe("R$ 1,00");
  });
});
