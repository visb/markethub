import {
  AdminMerchantsController,
  AdminStoreDetailController,
} from "./admin-merchants.controller";
import type { AdminMerchantsService } from "./admin-merchants.service";
import type { StorageService } from "../storage/storage.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * Controllers admin finos: navegação/CRUD de mercados e lojas (+ horário de
 * funcionamento, story 29). Apenas delegação ao `AdminMerchantsService`; logo
 * presignada via `StorageService`. Regra fica no service.
 */
function makeMerchantsController() {
  const merchants = {
    listMerchants: jest.fn().mockResolvedValue([{ id: "m1" }]),
    createMerchant: jest.fn().mockResolvedValue({ id: "m1" }),
    merchantDetail: jest.fn().mockResolvedValue({ id: "m1" }),
    updateMerchant: jest.fn().mockResolvedValue({ id: "m1" }),
  };
  const storage = { presignUpload: jest.fn().mockResolvedValue({ url: "http://put" }) };
  const controller = new AdminMerchantsController(
    merchants as unknown as AdminMerchantsService,
    storage as unknown as StorageService,
  );
  return { controller, merchants, storage };
}

function makeStoreController() {
  const merchants = {
    createStore: jest.fn().mockResolvedValue({ id: "s1" }),
    storeDetail: jest.fn().mockResolvedValue({ id: "s1" }),
    updateStore: jest.fn().mockResolvedValue({ id: "s1" }),
    setStoreActive: jest.fn().mockResolvedValue({ id: "s1", active: false }),
    storeOffers: jest.fn().mockResolvedValue({ items: [] }),
    storeStaff: jest.fn().mockResolvedValue([]),
    storeHours: jest.fn().mockResolvedValue([]),
    setStoreHours: jest.fn().mockResolvedValue([]),
    updateOffer: jest.fn().mockResolvedValue({}),
    unlockOffer: jest.fn().mockResolvedValue({}),
    updateStock: jest.fn().mockResolvedValue({}),
    unlockStock: jest.fn().mockResolvedValue({}),
    setStaffActive: jest.fn().mockResolvedValue({}),
    removeStaff: jest.fn().mockResolvedValue({}),
  };
  const controller = new AdminStoreDetailController(merchants as unknown as AdminMerchantsService);
  return { controller, merchants };
}

const admin: AuthUser = { id: "a1", email: "a@x.com", roles: ["admin"] };

describe("AdminMerchantsController", () => {
  it("logoUploadUrl: sanitiza o filename e presigna o objeto", async () => {
    const { controller, storage } = makeMerchantsController();
    await controller.logoUploadUrl("m1", { filename: "minha logo!.png", contentType: "image/png" });
    const key = storage.presignUpload.mock.calls[0][0] as string;
    expect(key).toMatch(/^merchants\/m1\/logo-\d+-minha_logo_\.png$/);
    expect(storage.presignUpload.mock.calls[0][1]).toBe("image/png");
  });

  it("list/create/detail/update delegam ao service", () => {
    const { controller, merchants } = makeMerchantsController();
    controller.list("super");
    controller.create({ name: "Rede" });
    controller.detail("m1");
    controller.update("m1", { name: "Novo" });
    expect(merchants.listMerchants).toHaveBeenCalledWith("super");
    expect(merchants.createMerchant).toHaveBeenCalledWith({ name: "Rede" });
    expect(merchants.merchantDetail).toHaveBeenCalledWith("m1");
    expect(merchants.updateMerchant).toHaveBeenCalledWith("m1", { name: "Novo" });
  });
});

describe("AdminStoreDetailController", () => {
  it("create/detail/update/setActive delegam", () => {
    const { controller, merchants } = makeStoreController();
    controller.create({ merchantId: "m1", name: "Loja" });
    controller.detail("s1");
    controller.update("s1", { phone: "4199", allowsPickup: true });
    controller.setActive("s1", { active: false });
    expect(merchants.createStore).toHaveBeenCalledWith({ merchantId: "m1", name: "Loja" });
    expect(merchants.storeDetail).toHaveBeenCalledWith("s1");
    expect(merchants.updateStore).toHaveBeenCalledWith("s1", { phone: "4199", allowsPickup: true });
    expect(merchants.setStoreActive).toHaveBeenCalledWith("s1", false);
  });

  it("offers: converte available/page/pageSize das query strings", () => {
    const { controller, merchants } = makeStoreController();
    controller.offers("s1", "leite", "c1", "true", "2", "30");
    expect(merchants.storeOffers).toHaveBeenCalledWith("s1", {
      search: "leite",
      categoryId: "c1",
      available: true,
      page: 2,
      pageSize: 30,
    });
  });

  it("offers: available ausente → undefined (não filtra)", () => {
    const { controller, merchants } = makeStoreController();
    controller.offers("s1");
    expect(merchants.storeOffers).toHaveBeenCalledWith("s1", {
      search: undefined,
      categoryId: undefined,
      available: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it("staff: delega storeStaff", () => {
    const { controller, merchants } = makeStoreController();
    controller.staff("s1");
    expect(merchants.storeStaff).toHaveBeenCalledWith("s1");
  });

  // ── Horário de funcionamento (story 29) ──

  it("hours: delega storeHours(id)", () => {
    const { controller, merchants } = makeStoreController();
    controller.hours("s1");
    expect(merchants.storeHours).toHaveBeenCalledWith("s1");
  });

  it("setHours: repassa o array de faixas (replace-all)", () => {
    const { controller, merchants } = makeStoreController();
    const hours = [{ dayOfWeek: 1, opensAt: 480, closesAt: 1080 }];
    controller.setHours("s1", { hours });
    expect(merchants.setStoreHours).toHaveBeenCalledWith("s1", hours);
  });

  it("ofertas/estoque/staff: delegam repassando o user.id do ator", () => {
    const { controller, merchants } = makeStoreController();
    controller.updateOffer(admin, "of1", { priceCents: 100 });
    controller.unlockOffer(admin, "of1", "price");
    controller.updateStock(admin, "sk1", { quantity: 5 });
    controller.unlockStock(admin, "sk1", "quantity");
    controller.setStaffActive("st1", { active: false });
    controller.removeStaff("st1");
    expect(merchants.updateOffer).toHaveBeenCalledWith("of1", { priceCents: 100 }, "a1");
    expect(merchants.unlockOffer).toHaveBeenCalledWith("of1", "price", "a1");
    expect(merchants.updateStock).toHaveBeenCalledWith("sk1", { quantity: 5 }, "a1");
    expect(merchants.unlockStock).toHaveBeenCalledWith("sk1", "quantity", "a1");
    expect(merchants.setStaffActive).toHaveBeenCalledWith("st1", false);
    expect(merchants.removeStaff).toHaveBeenCalledWith("st1");
  });
});
