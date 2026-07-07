import { CatalogService, NEARBY_STORES_CAP, type ViewportBounds, CatalogService as CS, isOpenAt, saoPauloDayAndMinute } from "./catalog.service";
import type { StoreFollowsService } from "../store-follows";

// Story 34: o CatalogService passou a depender do StoreFollowsService (following nas
// sections). Stub padrão: não segue ninguém; testes de follow sobrescrevem isFollowing.
const isFollowingMock = jest.fn().mockResolvedValue(false);
const followsStub = { isFollowing: isFollowingMock } as unknown as StoreFollowsService;
beforeEach(() => isFollowingMock.mockReset().mockResolvedValue(false));

type StoreRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  avgPrepMinutes: number;
  merchant: { name: string; logoUrl: string | null };
};

function makeStore(id: string, latitude: number | null, longitude: number | null): StoreRow {
  return {
    id,
    name: `Loja ${id}`,
    city: "São Paulo",
    state: "SP",
    latitude,
    longitude,
    avgPrepMinutes: 15,
    merchant: { name: `Mercado ${id}`, logoUrl: null },
  };
}

/**
 * `findMany` recebe o `where`/`take`; o mock devolve `rows` (já filtrados pelo teste
 * conforme o cenário) e expõe os args p/ asserts sobre o filtro/teto enviados ao Prisma.
 */
function makePrisma(rows: StoreRow[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  return { prisma: { store: { findMany } } as never, findMany };
}

const bounds: ViewportBounds = { north: 10, south: -10, east: 10, west: -10 };

describe("CatalogService.listStoresInBounds", () => {
  it("filtra por lat/lng no range e exclui nulos via where do Prisma", async () => {
    const { prisma, findMany } = makePrisma([makeStore("a", 1, 1)]);
    const svc = new CatalogService(prisma, followsStub);
    await svc.listStoresInBounds(bounds);

    const where = findMany.mock.calls[0][0].where;
    expect(where.active).toBe(true);
    expect(where.latitude).toEqual({ not: null, gte: -10, lte: 10 });
    expect(where.longitude).toEqual({ not: null, gte: -10, lte: 10 });
  });

  it("mapeia para o shape enxuto de marcador (sem produtos)", async () => {
    const { prisma } = makePrisma([makeStore("a", 1, 2)]);
    const svc = new CatalogService(prisma, followsStub);
    const [s] = await svc.listStoresInBounds(bounds);

    expect(s).toEqual({
      id: "a",
      name: "Loja a",
      latitude: 1,
      longitude: 2,
      city: "São Paulo",
      state: "SP",
      avgPrepMinutes: 15,
      merchantName: "Mercado a",
      merchantLogoUrl: null,
    });
  });

  it("aplica o teto NEARBY_STORES_CAP no take", async () => {
    const { prisma, findMany } = makePrisma([]);
    const svc = new CatalogService(prisma, followsStub);
    await svc.listStoresInBounds(bounds);
    expect(findMany.mock.calls[0][0].take).toBe(NEARBY_STORES_CAP);
  });

  it("ordena pela proximidade ao centro do box", async () => {
    // centro do box = (0,0). 'perto' a (1,1); 'longe' a (9,9).
    const { prisma } = makePrisma([makeStore("longe", 9, 9), makeStore("perto", 1, 1)]);
    const svc = new CatalogService(prisma, followsStub);
    const result = await svc.listStoresInBounds(bounds);
    expect(result.map((s) => s.id)).toEqual(["perto", "longe"]);
  });
});

// ─── Mock flexível do Prisma p/ os demais métodos do service ───
type AnyFn = jest.Mock;
interface CatalogMocks {
  merchant: { findMany: AnyFn; findUnique: AnyFn };
  store: { findMany: AnyFn; findUnique: AnyFn };
  offer: { findMany: AnyFn; count: AnyFn };
  product: { findUnique: AnyFn };
  marketplaceCategory: { findMany: AnyFn; findUnique: AnyFn };
}

function makeCatalog() {
  const m: CatalogMocks = {
    merchant: { findMany: jest.fn(), findUnique: jest.fn() },
    store: { findMany: jest.fn(), findUnique: jest.fn() },
    offer: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    product: { findUnique: jest.fn() },
    marketplaceCategory: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  const prisma = {
    ...m,
    // array de promises → Promise.all (mesma semântica do Prisma p/ transação por lote)
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as never;
  return { prisma, m };
}

const activeStore = { id: "s1", active: true, latitude: 0, longitude: 0 };

function offerRow(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    priceCents: 100,
    promoPriceCents: null,
    product: {
      id: `p-${id}`,
      name: `Produto ${id}`,
      brand: "Marca",
      packageSize: "1kg",
      saleType: "unit",
      imageUrl: null,
      gtin: "789",
      category: { id: "c1", name: "Cat", slug: "cat" },
    },
    ...over,
  };
}

describe("CatalogService.listMerchants", () => {
  it("lista mercados ativos ordenados por nome", async () => {
    const { prisma, m } = makeCatalog();
    m.merchant.findMany.mockResolvedValue([{ id: "x" }]);
    const res = await new CatalogService(prisma, followsStub).listMerchants();
    expect(m.merchant.findMany.mock.calls[0][0]).toMatchObject({
      where: { active: true },
      orderBy: { name: "asc" },
    });
    expect(res).toEqual([{ id: "x" }]);
  });
});

describe("CatalogService.listStores", () => {
  it("lança MERCHANT_NOT_FOUND quando o mercado não existe", async () => {
    const { prisma, m } = makeCatalog();
    m.merchant.findUnique.mockResolvedValue(null);
    await expect(new CatalogService(prisma, followsStub).listStores("m1")).rejects.toMatchObject({
      response: { code: "MERCHANT_NOT_FOUND" },
    });
  });

  it("lista lojas ativas do mercado", async () => {
    const { prisma, m } = makeCatalog();
    m.merchant.findUnique.mockResolvedValue({ id: "m1" });
    m.store.findMany.mockResolvedValue([{ id: "s1" }]);
    const res = await new CatalogService(prisma, followsStub).listStores("m1");
    expect(m.store.findMany.mock.calls[0][0].where).toEqual({ merchantId: "m1", active: true });
    expect(res).toEqual([{ id: "s1" }]);
  });
});

describe("CatalogService.listStoreCategories", () => {
  it("deduplica categorias com produto disponível e ordena por nome", async () => {
    const { prisma, m } = makeCatalog();
    m.store.findUnique.mockResolvedValue(activeStore);
    m.offer.findMany.mockResolvedValue([
      { product: { category: { id: "c2", name: "Bebidas", slug: "bebidas" } } },
      { product: { category: { id: "c1", name: "Açougue", slug: "acougue" } } },
      { product: { category: { id: "c2", name: "Bebidas", slug: "bebidas" } } }, // dup
      { product: { category: null } }, // ignorada
    ]);
    const res = await new CatalogService(prisma, followsStub).listStoreCategories("s1");
    expect(res.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("propaga STORE_NOT_FOUND quando a loja não existe/inativa", async () => {
    const { prisma, m } = makeCatalog();
    m.store.findUnique.mockResolvedValue(null);
    await expect(new CatalogService(prisma, followsStub).listStoreCategories("s1")).rejects.toMatchObject({
      response: { code: "STORE_NOT_FOUND" },
    });
  });
});

describe("CatalogService.listStoreProducts", () => {
  it("achata oferta+produto e pagina (clamp do pageSize)", async () => {
    const { prisma, m } = makeCatalog();
    m.store.findUnique.mockResolvedValue(activeStore);
    m.offer.findMany.mockResolvedValue([offerRow("o1")]);
    m.offer.count.mockResolvedValue(1);
    const res = await new CatalogService(prisma, followsStub).listStoreProducts("s1", { pageSize: 999 });
    expect(res.pageSize).toBe(100); // MAX_PAGE_SIZE
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({ offerId: "o1", priceCents: 100, id: "p-o1" });
  });

  it("aplica filtro de categoria crua e de categoria de marketplace", async () => {
    const { prisma, m } = makeCatalog();
    m.store.findUnique.mockResolvedValue(activeStore);
    await new CatalogService(prisma, followsStub).listStoreProducts("s1", {
      categoryId: "c1",
      marketplaceCategoryId: "mc1",
    });
    const where = m.offer.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      storeId: "s1",
      available: true,
      product: { categoryId: "c1", category: { marketplaceCategoryId: "mc1" } },
    });
  });

  it("sem filtros não inclui cláusula de produto", async () => {
    const { prisma, m } = makeCatalog();
    m.store.findUnique.mockResolvedValue(activeStore);
    await new CatalogService(prisma, followsStub).listStoreProducts("s1", {});
    expect(m.offer.findMany.mock.calls[0][0].where).not.toHaveProperty("product");
  });
});

describe("CatalogService.search", () => {
  it("termo vazio → resultado vazio sem tocar o banco", async () => {
    const { prisma, m } = makeCatalog();
    const res = await new CatalogService(prisma, followsStub).search("   ", {});
    expect(res).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
    expect(m.offer.findMany).not.toHaveBeenCalled();
  });

  it("busca por nome/marca/categoria, restrita à loja quando informada", async () => {
    const { prisma, m } = makeCatalog();
    m.offer.findMany.mockResolvedValue([offerRow("o1")]);
    m.offer.count.mockResolvedValue(1);
    const res = await new CatalogService(prisma, followsStub).search("arroz", { storeId: "s1" });
    const where = m.offer.findMany.mock.calls[0][0].where;
    expect(where.storeId).toBe("s1");
    expect(where.product.OR).toHaveLength(3);
    expect(res.items[0]).toMatchObject({ offerId: "o1" });
  });
});

describe("CatalogService.productDetail", () => {
  it("lança PRODUCT_NOT_FOUND quando ausente", async () => {
    const { prisma, m } = makeCatalog();
    m.product.findUnique.mockResolvedValue(null);
    await expect(new CatalogService(prisma, followsStub).productDetail("p1")).rejects.toMatchObject({
      response: { code: "PRODUCT_NOT_FOUND" },
    });
  });

  it("achata categoria e extrai prepOptions válidos", async () => {
    const { prisma, m } = makeCatalog();
    m.product.findUnique.mockResolvedValue({
      id: "p1",
      name: "Arroz",
      category: {
        id: "c1",
        name: "Mercearia",
        slug: "mercearia",
        marketplaceCategory: { prepOptions: { label: "Como preparar?", options: ["a", "b"] } },
      },
      offers: [],
    });
    const res = await new CatalogService(prisma, followsStub).productDetail("p1");
    expect(res.category).toEqual({ id: "c1", name: "Mercearia", slug: "mercearia" });
    expect(res.prepOptions).toEqual({ label: "Como preparar?", options: ["a", "b"] });
  });

  it("prepOptions inválido/ausente vira null e categoria nula é tolerada", async () => {
    const { prisma, m } = makeCatalog();
    m.product.findUnique.mockResolvedValue({
      id: "p1",
      name: "Arroz",
      category: { id: "c1", name: "X", slug: "x", marketplaceCategory: { prepOptions: { options: [] } } },
      offers: [],
    });
    const withInvalid = await new CatalogService(prisma, followsStub).productDetail("p1");
    expect(withInvalid.prepOptions).toBeNull();

    m.product.findUnique.mockResolvedValue({ id: "p2", name: "Y", category: null, offers: [] });
    const noCat = await new CatalogService(prisma, followsStub).productDetail("p2");
    expect(noCat.category).toBeNull();
    expect(noCat.prepOptions).toBeNull();
  });
});

describe("CatalogService.storeSections", () => {
  function sectionStore(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: "s1",
      name: "Loja",
      active: true,
      latitude: 0,
      longitude: 0,
      avgPrepMinutes: 15,
      merchant: { name: "Mercado", logoUrl: null, deliveryFeeCents: 500 },
      ...over,
    };
  }

  it("lança STORE_NOT_FOUND quando inativa", async () => {
    const { prisma, m } = makeCatalog();
    m.store.findUnique.mockResolvedValue(sectionStore({ active: false }));
    await expect(new CatalogService(prisma, followsStub).storeSections("s1")).rejects.toMatchObject({
      response: { code: "STORE_NOT_FOUND" },
    });
  });

  it("monta seções e calcula distância/ETA com geo", async () => {
    const { prisma, m } = makeCatalog();
    m.store.findUnique.mockResolvedValue(sectionStore({ latitude: -23.5, longitude: -46.6 }));
    m.offer.findMany.mockResolvedValue([offerRow("o1")]);
    const res = await new CatalogService(prisma, followsStub).storeSections("s1", {
      lat: -23.6,
      lng: -46.6,
    });
    expect(res.store.deliveryFeeCents).toBe(500);
    expect(res.store.distanceKm).toBeGreaterThan(0);
    expect(res.featured).toHaveLength(1);
    expect(res.mostBought).toHaveLength(1);
    expect(res.recommended).toHaveLength(1);
  });

  it("sem geo a distância é nula", async () => {
    const { prisma, m } = makeCatalog();
    m.store.findUnique.mockResolvedValue(sectionStore());
    const res = await new CatalogService(prisma, followsStub).storeSections("s1");
    expect(res.store.distanceKm).toBeNull();
  });

  // Story 34: following na meta da loja.
  it("guest (sem userId) → following false, sem consultar isFollowing", async () => {
    const { prisma, m } = makeCatalog();
    m.store.findUnique.mockResolvedValue(sectionStore());
    const res = await new CatalogService(prisma, followsStub).storeSections("s1");
    expect(res.store.following).toBe(false);
    expect(isFollowingMock).not.toHaveBeenCalled();
  });

  it("cliente que segue → following true via isFollowing(userId, storeId)", async () => {
    const { prisma, m } = makeCatalog();
    m.store.findUnique.mockResolvedValue(sectionStore());
    isFollowingMock.mockResolvedValue(true);
    const res = await new CatalogService(prisma, followsStub).storeSections("s1", undefined, "u1");
    expect(res.store.following).toBe(true);
    expect(isFollowingMock).toHaveBeenCalledWith("u1", "s1");
  });
});

describe("CatalogService.feed", () => {
  function feedOffer(storeId: string, lat: number | null, lng: number | null) {
    return {
      id: `o-${storeId}`,
      priceCents: 200,
      promoPriceCents: null,
      store: {
        id: storeId,
        name: `Loja ${storeId}`,
        latitude: lat,
        longitude: lng,
        avgPrepMinutes: 10,
        merchant: { name: "Mercado", logoUrl: null, deliveryFeeCents: 0 },
      },
      product: {
        id: `p-${storeId}`,
        name: "Item",
        brand: null,
        packageSize: null,
        saleType: "unit",
        imageUrl: null,
      },
    };
  }

  it("descarta categorias sem itens e mantém as com produtos", async () => {
    const { prisma, m } = makeCatalog();
    m.marketplaceCategory.findMany.mockResolvedValue([
      { id: "cat-cheia", name: "Bebidas", slug: "bebidas" },
      { id: "cat-vazia", name: "Vazia", slug: "vazia" },
    ]);
    m.offer.findMany
      .mockResolvedValueOnce([feedOffer("s1", null, null)])
      .mockResolvedValueOnce([]);
    const res = await new CatalogService(prisma, followsStub).feed();
    expect(res).toHaveLength(1);
    expect(res[0].category.id).toBe("cat-cheia");
    expect(res[0].items[0]).toMatchObject({ storeId: "s1", deliveryEta: expect.any(String) });
  });

  it("com raio busca excedente (take*3) e filtra por distância", async () => {
    const { prisma, m } = makeCatalog();
    m.marketplaceCategory.findMany.mockResolvedValue([{ id: "cat", name: "C", slug: "c" }]);
    // perto (dentro do raio) e longe (fora)
    m.offer.findMany.mockResolvedValue([
      feedOffer("perto", -23.5, -46.6),
      feedOffer("longe", -3.1, -60.0),
    ]);
    const res = await new CatalogService(prisma, followsStub).feed({
      geo: { lat: -23.5, lng: -46.6, radiusKm: 5 },
    });
    // take default 10 → com raio busca 30
    expect(m.offer.findMany.mock.calls[0][0].take).toBe(30);
    expect(res[0].items.map((i) => i.storeId)).toEqual(["perto"]);
  });
});

describe("CatalogService.categoryFeed", () => {
  it("lança CATEGORY_NOT_FOUND quando a categoria curada não existe", async () => {
    const { prisma, m } = makeCatalog();
    m.marketplaceCategory.findUnique.mockResolvedValue(null);
    await expect(new CatalogService(prisma, followsStub).categoryFeed("mc1")).rejects.toMatchObject({
      response: { code: "CATEGORY_NOT_FOUND" },
    });
  });

  it("retorna categoria + itens paginados, com busca opcional restrita", async () => {
    const { prisma, m } = makeCatalog();
    m.marketplaceCategory.findUnique.mockResolvedValue({ id: "mc1", name: "Bebidas", slug: "bebidas" });
    m.offer.findMany.mockResolvedValue([]);
    const res = await new CatalogService(prisma, followsStub).categoryFeed("mc1", { q: "coca", storeId: "s1" });
    expect(res.category).toEqual({ id: "mc1", name: "Bebidas", slug: "bebidas" });
    const where = m.offer.findMany.mock.calls[0][0].where;
    expect(where.storeId).toBe("s1");
    expect(where.product.OR).toHaveLength(2);
    expect(where.product.category).toEqual({ marketplaceCategoryId: "mc1" });
  });
});

// ─── Story 29: resumo da loja (modal explore) ───

describe("isOpenAt (story 29)", () => {
  const hours = [
    { dayOfWeek: 1, opensAt: 480, closesAt: 1320 }, // seg 8h–22h
    { dayOfWeek: 0, opensAt: 480, closesAt: 1200 }, // dom 8h–20h
  ];

  it("dentro da janela → aberto", () => {
    expect(isOpenAt(hours, 1, 600)).toBe(true);
  });
  it("abertura é inclusiva (opensAt) → aberto", () => {
    expect(isOpenAt(hours, 1, 480)).toBe(true);
  });
  it("fechamento é exclusivo (closesAt) → fechado", () => {
    expect(isOpenAt(hours, 1, 1320)).toBe(false);
  });
  it("antes da abertura → fechado", () => {
    expect(isOpenAt(hours, 1, 479)).toBe(false);
  });
  it("depois do fechamento → fechado", () => {
    expect(isOpenAt(hours, 1, 1321)).toBe(false);
  });
  it("dia sem linha → fechado", () => {
    expect(isOpenAt(hours, 3, 600)).toBe(false);
  });
});

describe("saoPauloDayAndMinute (story 29)", () => {
  it("converte UTC para America/Sao_Paulo (-03:00)", () => {
    // 2026-06-28 é um domingo; 12:00Z → 09:00 em São Paulo.
    const { dayOfWeek, minuteOfDay } = saoPauloDayAndMinute(new Date("2026-06-28T12:00:00Z"));
    expect(dayOfWeek).toBe(0);
    expect(minuteOfDay).toBe(9 * 60);
  });
});

describe("CatalogService.storeSummary (story 29)", () => {
  function makeSummaryPrisma(store: unknown, agg: unknown) {
    return {
      store: { findUnique: jest.fn().mockResolvedValue(store) },
      review: { aggregate: jest.fn().mockResolvedValue(agg) },
    } as never;
  }
  const baseStore = {
    id: "s1",
    name: "Europa - Centro",
    active: true,
    street: "Rua X",
    number: "100",
    district: "Centro",
    city: "Curitiba",
    state: "PR",
    phone: "(41) 3000-1001",
    allowsPickup: true,
    avgPrepMinutes: 30,
    merchantId: "m1",
    merchant: { name: "Supermercado Europa", logoUrl: null, deliveryFeeCents: 700 },
    hours: [{ dayOfWeek: 0, opensAt: 480, closesAt: 1200 }],
  };
  // domingo 09:00 São Paulo → dentro de 8h–20h
  const sundayMorning = new Date("2026-06-28T12:00:00Z");

  it("monta o DTO com endereço, ETA, faixa de frete (piso/teto) e logo/merchant", async () => {
    const prisma = makeSummaryPrisma(baseStore, { _avg: { rating: null }, _count: { _all: 0 } });
    const out = await new CS(prisma, followsStub).storeSummary("s1", sundayMorning);
    expect(out).toMatchObject({
      id: "s1",
      name: "Europa - Centro",
      merchantName: "Supermercado Europa",
      merchantLogoUrl: null,
      address: { street: "Rua X", number: "100", district: "Centro", city: "Curitiba", state: "PR" },
      phone: "(41) 3000-1001",
      etaMinutes: 30,
      deliveryFeeCents: 700,
      doorFeeCents: 700 + 400, // + door surcharge
      allowsPickup: true,
      openNow: true,
    });
  });

  it("rating null quando não há reviews", async () => {
    const prisma = makeSummaryPrisma(baseStore, { _avg: { rating: null }, _count: { _all: 0 } });
    const out = await new CS(prisma, followsStub).storeSummary("s1", sundayMorning);
    expect(out.rating).toBeNull();
  });

  it("rating agrega média + contagem das reviews axis=merchant", async () => {
    const prisma = makeSummaryPrisma(baseStore, { _avg: { rating: 4.25 }, _count: { _all: 8 } });
    const out = await new CS(prisma, followsStub).storeSummary("s1", sundayMorning);
    expect(out.rating).toEqual({ average: 4.3, count: 8 });
    const where = (prisma as never as { review: { aggregate: jest.Mock } }).review.aggregate.mock
      .calls[0][0].where;
    expect(where).toEqual({ axis: "merchant", targetMerchantId: "m1" });
  });

  it("openNow false fora da janela do dia", async () => {
    const prisma = makeSummaryPrisma(baseStore, { _avg: { rating: null }, _count: { _all: 0 } });
    // 2026-06-28 23:00Z → 20:00 São Paulo (== closesAt 1200, exclusivo) → fechado
    const out = await new CS(prisma, followsStub).storeSummary("s1", new Date("2026-06-28T23:00:00Z"));
    expect(out.openNow).toBe(false);
  });

  it("allowsPickup reflete a coluna", async () => {
    const prisma = makeSummaryPrisma(
      { ...baseStore, allowsPickup: false },
      { _avg: { rating: null }, _count: { _all: 0 } },
    );
    const out = await new CS(prisma, followsStub).storeSummary("s1", sundayMorning);
    expect(out.allowsPickup).toBe(false);
  });

  it("loja inexistente → 404 STORE_NOT_FOUND", async () => {
    const prisma = makeSummaryPrisma(null, { _avg: { rating: null }, _count: { _all: 0 } });
    await expect(new CS(prisma, followsStub).storeSummary("x")).rejects.toMatchObject({
      response: { code: "STORE_NOT_FOUND" },
    });
  });

  it("loja inativa → 404 STORE_NOT_FOUND", async () => {
    const prisma = makeSummaryPrisma(
      { ...baseStore, active: false },
      { _avg: { rating: null }, _count: { _all: 0 } },
    );
    await expect(new CS(prisma, followsStub).storeSummary("s1")).rejects.toMatchObject({
      response: { code: "STORE_NOT_FOUND" },
    });
  });
});
