import { MerchantController } from "./merchant.controller";
import type { MerchantService } from "./merchant.service";
import type { MerchantProductService } from "./merchant-product.service";
import type { AuthUser } from "../auth";

/**
 * Story 43: controller fino do app merchant — delega a MerchantService (lojas/
 * ofertas/estoque) e MerchantProductService (produtos). Cobre o roteamento +
 * a normalização do filtro `available` (string da query → boolean | undefined).
 */
function make() {
  const merchant = {
    myStores: jest.fn().mockResolvedValue([{ id: "s1" }]),
    listStores: jest.fn().mockResolvedValue([{ id: "s1", name: "Loja" }]),
    createStore: jest.fn().mockResolvedValue({ id: "s2" }),
    updateStore: jest.fn().mockResolvedValue({ id: "s1" }),
    listOffers: jest.fn().mockResolvedValue([{ id: "o1" }]),
    updateOffer: jest.fn().mockResolvedValue({ id: "o1" }),
    unlockOffer: jest.fn().mockResolvedValue({ id: "o1" }),
    listStocks: jest.fn().mockResolvedValue([{ id: "k1" }]),
    updateStock: jest.fn().mockResolvedValue({ id: "k1" }),
    unlockStock: jest.fn().mockResolvedValue({ id: "k1" }),
    storeHours: jest.fn().mockResolvedValue([{ id: "h1" }]),
    setStoreHours: jest.fn().mockResolvedValue([{ id: "h1" }]),
    storeClosures: jest.fn().mockResolvedValue([{ id: "c1" }]),
    addStoreClosure: jest.fn().mockResolvedValue({ id: "c1" }),
    removeStoreClosure: jest.fn().mockResolvedValue({ removed: true }),
  };
  const products = {
    uploadUrl: jest.fn().mockResolvedValue({ url: "u", key: "k" }),
    create: jest.fn().mockResolvedValue({ product: { id: "p1" } }),
    update: jest.fn().mockResolvedValue({ id: "p1" }),
  };
  const controller = new MerchantController(
    merchant as unknown as MerchantService,
    products as unknown as MerchantProductService,
  );
  const user: AuthUser = { id: "u1", email: "m@x.com", roles: ["merchant"] };
  return { controller, merchant, products, user };
}

describe("MerchantController — lojas", () => {
  it("GET stores delega com user.id", async () => {
    const { controller, merchant, user } = make();
    expect(await controller.stores(user)).toEqual([{ id: "s1" }]);
    expect(merchant.myStores).toHaveBeenCalledWith("u1");
  });

  it("GET stores/detail passa identidade { id, roles }", async () => {
    const { controller, merchant, user } = make();
    await controller.storesDetail(user);
    expect(merchant.listStores).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] });
  });

  it("POST stores delega identidade + dto", async () => {
    const { controller, merchant, user } = make();
    await controller.createStore(user, { name: "Nova" });
    expect(merchant.createStore).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, { name: "Nova" });
  });

  it("PATCH stores/:id delega id + dto", async () => {
    const { controller, merchant, user } = make();
    await controller.updateStore(user, "s1", { name: "X" });
    expect(merchant.updateStore).toHaveBeenCalledWith({ id: "u1", roles: ["merchant"] }, "s1", { name: "X" });
  });
});

describe("MerchantController — horário + fechamentos (story 52)", () => {
  const identity = { id: "u1", roles: ["merchant"] };

  it("GET stores/:id/hours delega identidade + id", async () => {
    const { controller, merchant, user } = make();
    await controller.storeHours(user, "s1");
    expect(merchant.storeHours).toHaveBeenCalledWith(identity, "s1");
  });

  it("PUT stores/:id/hours delega as faixas do dto", async () => {
    const { controller, merchant, user } = make();
    await controller.setStoreHours(user, "s1", { hours: [{ dayOfWeek: 1, opensAt: 480, closesAt: 1320 }] });
    expect(merchant.setStoreHours).toHaveBeenCalledWith(identity, "s1", [
      { dayOfWeek: 1, opensAt: 480, closesAt: 1320 },
    ]);
  });

  it("GET stores/:id/closures delega identidade + id", async () => {
    const { controller, merchant, user } = make();
    await controller.storeClosures(user, "s1");
    expect(merchant.storeClosures).toHaveBeenCalledWith(identity, "s1");
  });

  it("POST stores/:id/closures delega dto", async () => {
    const { controller, merchant, user } = make();
    await controller.addStoreClosure(user, "s1", { date: "2026-12-25", reason: "Natal" });
    expect(merchant.addStoreClosure).toHaveBeenCalledWith(identity, "s1", {
      date: "2026-12-25",
      reason: "Natal",
    });
  });

  it("DELETE stores/:id/closures/:closureId delega ids", async () => {
    const { controller, merchant, user } = make();
    await controller.removeStoreClosure(user, "s1", "c1");
    expect(merchant.removeStoreClosure).toHaveBeenCalledWith(identity, "s1", "c1");
  });
});

describe("MerchantController — ofertas", () => {
  it("GET offers normaliza available='true' → true", async () => {
    const { controller, merchant, user } = make();
    await controller.listOffers(user, "s1", "c1", "leite", "true");
    expect(merchant.listOffers).toHaveBeenCalledWith("u1", {
      storeId: "s1",
      categoryId: "c1",
      search: "leite",
      available: true,
    });
  });

  it("GET offers normaliza available='false' → false", async () => {
    const { controller, merchant, user } = make();
    await controller.listOffers(user, undefined, undefined, undefined, "false");
    expect(merchant.listOffers.mock.calls[0][1].available).toBe(false);
  });

  it("GET offers available ausente → undefined", async () => {
    const { controller, merchant, user } = make();
    await controller.listOffers(user);
    expect(merchant.listOffers.mock.calls[0][1].available).toBeUndefined();
  });

  it("PATCH offers/:id delega", async () => {
    const { controller, merchant, user } = make();
    await controller.updateOffer(user, "o1", { priceCents: 199 });
    expect(merchant.updateOffer).toHaveBeenCalledWith("u1", "o1", { priceCents: 199 });
  });

  it("DELETE offers/:id/locks/:field delega", async () => {
    const { controller, merchant, user } = make();
    await controller.unlockOffer(user, "o1", "priceCents");
    expect(merchant.unlockOffer).toHaveBeenCalledWith("u1", "o1", "priceCents");
  });
});

describe("MerchantController — estoque", () => {
  it("GET stocks delega user.id + storeId", async () => {
    const { controller, merchant, user } = make();
    await controller.listStocks(user, "s1");
    expect(merchant.listStocks).toHaveBeenCalledWith("u1", "s1");
  });

  it("PATCH stocks/:id delega", async () => {
    const { controller, merchant, user } = make();
    await controller.updateStock(user, "k1", { quantity: 5 });
    expect(merchant.updateStock).toHaveBeenCalledWith("u1", "k1", { quantity: 5 });
  });

  it("DELETE stocks/:id/locks/:field delega", async () => {
    const { controller, merchant, user } = make();
    await controller.unlockStock(user, "k1", "quantity");
    expect(merchant.unlockStock).toHaveBeenCalledWith("u1", "k1", "quantity");
  });
});

describe("MerchantController — produtos", () => {
  it("POST products/upload-url delega filename + contentType", async () => {
    const { controller, products, user } = make();
    await controller.uploadUrl(user, { filename: "f.png", contentType: "image/png" });
    expect(products.uploadUrl).toHaveBeenCalledWith("u1", "f.png", "image/png");
  });

  it("POST products delega user.id + dto", async () => {
    const { controller, products, user } = make();
    await controller.createProduct(user, { storeId: "s1", name: "P", priceCents: 100 } as never);
    expect(products.create).toHaveBeenCalledWith("u1", { storeId: "s1", name: "P", priceCents: 100 });
  });

  it("PATCH products/:id delega id + dto", async () => {
    const { controller, products, user } = make();
    await controller.updateProduct(user, "p1", { name: "Novo" });
    expect(products.update).toHaveBeenCalledWith("u1", "p1", { name: "Novo" });
  });
});
