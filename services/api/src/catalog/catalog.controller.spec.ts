import { BadRequestException } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import type { CatalogService } from "./catalog.service";
import type { StoresNearbyQueryDto } from "./dto/stores-nearby.dto";

function makeController() {
  const listStoresInBounds = jest.fn().mockResolvedValue([{ id: "a" }]);
  const controller = new CatalogController({ listStoresInBounds } as unknown as CatalogService);
  return { controller, listStoresInBounds };
}

describe("CatalogController.storesNearby", () => {
  it("bounds válidos → delega ao service", async () => {
    const { controller, listStoresInBounds } = makeController();
    const q: StoresNearbyQueryDto = { north: 10, south: -10, east: 10, west: -10 };
    const res = await controller.storesNearby(q);
    expect(listStoresInBounds).toHaveBeenCalledWith(q);
    expect(res).toEqual([{ id: "a" }]);
  });

  it("north < south → 400 INVALID_BOUNDS", () => {
    const { controller, listStoresInBounds } = makeController();
    const q: StoresNearbyQueryDto = { north: -10, south: 10, east: 10, west: -10 };
    expect(() => controller.storesNearby(q)).toThrow(BadRequestException);
    expect(listStoresInBounds).not.toHaveBeenCalled();
    try {
      controller.storesNearby(q);
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({ code: "INVALID_BOUNDS" });
    }
  });

  it("east < west → 400 INVALID_BOUNDS", () => {
    const { controller } = makeController();
    const q: StoresNearbyQueryDto = { north: 10, south: -10, east: -10, west: 10 };
    expect(() => controller.storesNearby(q)).toThrow(BadRequestException);
  });
});

// ─── Delegação + parseGeo (query string → GeoFilter) ───
function makeFullController() {
  const svc = {
    feed: jest.fn().mockResolvedValue([]),
    categoryFeed: jest.fn().mockResolvedValue({}),
    listMerchants: jest.fn().mockResolvedValue([]),
    listStores: jest.fn().mockResolvedValue([]),
    listStoreCategories: jest.fn().mockResolvedValue([]),
    listStoreProducts: jest.fn().mockResolvedValue({}),
    storeSections: jest.fn().mockResolvedValue({}),
    storeSummary: jest.fn().mockResolvedValue({ id: "s1" }),
    search: jest.fn().mockResolvedValue({}),
    productDetail: jest.fn().mockResolvedValue({}),
  };
  return { controller: new CatalogController(svc as unknown as CatalogService), svc };
}

describe("CatalogController delegação", () => {
  it("feed: lat/lng válidos viram GeoFilter", () => {
    const { controller, svc } = makeFullController();
    controller.feed("-23.5", "-46.6", "5");
    expect(svc.feed).toHaveBeenCalledWith({ geo: { lat: -23.5, lng: -46.6, radiusKm: 5 } });
  });

  it("feed: lat/lng ausentes ou inválidos → geo undefined", () => {
    const { controller, svc } = makeFullController();
    controller.feed(undefined, undefined, undefined);
    expect(svc.feed).toHaveBeenCalledWith({ geo: undefined });
    controller.feed("abc", "-46.6");
    expect(svc.feed).toHaveBeenLastCalledWith({ geo: undefined });
  });

  it("feed: raio <= 0 é descartado do GeoFilter", () => {
    const { controller, svc } = makeFullController();
    controller.feed("-23.5", "-46.6", "0");
    expect(svc.feed).toHaveBeenCalledWith({ geo: { lat: -23.5, lng: -46.6 } });
  });

  it("categoryFeed: repassa id, q, storeId, paginação e geo", () => {
    const { controller, svc } = makeFullController();
    controller.categoryFeed("mc1", "coca", "s1", "2", "30", "-23.5", "-46.6");
    expect(svc.categoryFeed).toHaveBeenCalledWith("mc1", {
      q: "coca",
      storeId: "s1",
      page: 2,
      pageSize: 30,
      geo: { lat: -23.5, lng: -46.6 },
    });
  });

  it("merchants/stores/categories delegam direto", () => {
    const { controller, svc } = makeFullController();
    controller.merchants();
    controller.stores("m1");
    controller.categories("s1");
    expect(svc.listMerchants).toHaveBeenCalled();
    expect(svc.listStores).toHaveBeenCalledWith("m1");
    expect(svc.listStoreCategories).toHaveBeenCalledWith("s1");
  });

  it("products: converte page/pageSize numéricos", () => {
    const { controller, svc } = makeFullController();
    controller.products("s1", "c1", "mc1", "3", "50");
    expect(svc.listStoreProducts).toHaveBeenCalledWith("s1", {
      categoryId: "c1",
      marketplaceCategoryId: "mc1",
      page: 3,
      pageSize: 50,
    });
  });

  it("sections: parseGeo sem radius; guest → userId undefined", () => {
    const { controller, svc } = makeFullController();
    controller.sections("s1", "-23.5", "-46.6");
    expect(svc.storeSections).toHaveBeenCalledWith("s1", { lat: -23.5, lng: -46.6 }, undefined);
  });

  it("sections: cliente logado repassa user.id (following — story 34)", () => {
    const { controller, svc } = makeFullController();
    controller.sections("s1", undefined, undefined, {
      id: "u1",
      email: "c@x.com",
      roles: ["customer"],
    });
    expect(svc.storeSections).toHaveBeenCalledWith("s1", undefined, "u1");
  });

  it("search: default de q vazio e paginação opcional", () => {
    const { controller, svc } = makeFullController();
    controller.search(undefined as unknown as string);
    expect(svc.search).toHaveBeenCalledWith("", {
      storeId: undefined,
      page: undefined,
      pageSize: undefined,
    });
  });

  it("product: delega productDetail", () => {
    const { controller, svc } = makeFullController();
    controller.product("p1");
    expect(svc.productDetail).toHaveBeenCalledWith("p1");
  });

  it("storeSummary: delega storeSummary (modal explore — story 29)", () => {
    const { controller, svc } = makeFullController();
    controller.storeSummary("s1");
    expect(svc.storeSummary).toHaveBeenCalledWith("s1");
  });
});
