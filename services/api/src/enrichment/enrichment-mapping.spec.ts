import { EnrichmentService } from "./enrichment.service";

/**
 * Foco C04: mapeamento de categoria (resolveCategory — reuso de CategoryMapping
 * persistido, gating por confiança, persistência de novo mapping) + cache do Cosmos
 * (lookupCached) + transição de status por score. enrichProduct/lockedFields já em
 * enrichment.service.spec.ts; score puro em completeness.spec.ts.
 */
const VALID_GTIN = "0000000000017";

interface Opts {
  product?: Record<string, unknown> | null;
  cached?: unknown;
  providerResult?: unknown;
  mapping?: { categoryId: string | null; confidence: number } | null;
  classify?: { slug: string; confidence: number } | null;
  categoryBySlug?: Record<string, { id: string }>;
  categoryById?: Record<string, { slug: string }>;
}

function baseProduct(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    gtin: VALID_GTIN,
    name: "Nome",
    brand: null,
    imageUrl: null,
    packageSize: null,
    categoryId: null,
    lockedFields: [],
    category: null,
    ...over,
  };
}

function makeDeps(opts: Opts) {
  const update = jest.fn().mockResolvedValue({});
  const cosmosUpsert = jest.fn().mockResolvedValue({});
  const mappingCreate = jest.fn().mockResolvedValue({});

  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(opts.product ?? baseProduct()),
      update,
    },
    cosmosCache: {
      findUnique: jest.fn().mockResolvedValue(opts.cached ?? null),
      upsert: cosmosUpsert,
    },
    productEnrichment: { upsert: jest.fn().mockResolvedValue({}) },
    categoryMapping: {
      findUnique: jest.fn().mockResolvedValue(opts.mapping ?? null),
      create: mappingCreate,
    },
    category: {
      findUnique: jest.fn(({ where }: { where: { slug?: string; id?: string } }) => {
        if (where.slug) return Promise.resolve(opts.categoryBySlug?.[where.slug] ?? null);
        if (where.id) return Promise.resolve(opts.categoryById?.[where.id] ?? null);
        return Promise.resolve(null);
      }),
    },
  } as never;

  const lookupByGtin = jest.fn().mockResolvedValue(opts.providerResult ?? null);
  const provider = { source: "cosmos", lookupByGtin } as never;
  const classify = jest.fn().mockResolvedValue(opts.classify ?? null);
  const mapper = { name: "heuristic", classify } as never;
  const storage = { uploadBuffer: jest.fn() } as never;

  const svc = new EnrichmentService(prisma, provider, mapper, storage);
  return { svc, update, cosmosUpsert, mappingCreate, lookupByGtin, classify };
}

describe("EnrichmentService — mapeamento de categoria", () => {
  const cachedWithCategory = {
    found: true,
    payload: { gtin: VALID_GTIN, name: "Refri", cosmosCategory: "Refrigerantes" },
  };

  it("sourceKey novo: classifica, persiste mapping e conecta a categoria (confiança alta)", async () => {
    const { svc, update, mappingCreate, classify } = makeDeps({
      cached: cachedWithCategory,
      classify: { slug: "bebidas", confidence: 0.9 },
      categoryBySlug: { bebidas: { id: "cat-beb" } },
      categoryById: { "cat-beb": { slug: "bebidas" } },
    });
    await svc.enrichProduct("p1");

    expect(classify).toHaveBeenCalledWith("Refrigerantes");
    expect(mappingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "cosmos",
          sourceKey: "Refrigerantes",
          categoryId: "cat-beb",
          confidence: 0.9,
          mapper: "heuristic",
        }),
      }),
    );
    expect(update.mock.calls[0][0].data.category).toEqual({ connect: { id: "cat-beb" } });
  });

  it("confiança baixa: persiste o mapping mas NÃO conecta a categoria", async () => {
    const { svc, update, mappingCreate } = makeDeps({
      cached: cachedWithCategory,
      classify: { slug: "mercearia", confidence: 0.3 },
      categoryBySlug: { mercearia: { id: "cat-merc" } },
      categoryById: { "cat-merc": { slug: "mercearia" } },
    });
    await svc.enrichProduct("p1");

    expect(mappingCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ confidence: 0.3 }) }),
    );
    expect(update.mock.calls[0][0].data.category).toBeUndefined();
  });

  it("mapping persistido com confiança alta: reusa sem chamar o mapper", async () => {
    const { svc, update, classify, mappingCreate } = makeDeps({
      cached: cachedWithCategory,
      mapping: { categoryId: "cat-x", confidence: 0.8 },
      categoryById: { "cat-x": { slug: "x" } },
    });
    await svc.enrichProduct("p1");

    expect(classify).not.toHaveBeenCalled();
    expect(mappingCreate).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data.category).toEqual({ connect: { id: "cat-x" } });
  });

  it("mapping persistido com confiança baixa: não conecta e não chama o mapper", async () => {
    const { svc, update, classify } = makeDeps({
      cached: cachedWithCategory,
      mapping: { categoryId: "cat-x", confidence: 0.2 },
    });
    await svc.enrichProduct("p1");

    expect(classify).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data.category).toBeUndefined();
  });
});

describe("EnrichmentService — cache do Cosmos (lookupCached)", () => {
  it("cache miss: consulta o provider e grava no cache", async () => {
    const { svc, cosmosUpsert, lookupByGtin } = makeDeps({
      cached: null,
      providerResult: { gtin: VALID_GTIN, name: "Do Provider" },
    });
    const result = await svc.enrichProduct("p1");

    expect(lookupByGtin).toHaveBeenCalledWith(VALID_GTIN);
    expect(cosmosUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gtin: VALID_GTIN },
        create: expect.objectContaining({ gtin: VALID_GTIN, found: true }),
      }),
    );
    expect(result.found).toBe(true);
  });

  it("cache hit found=false: não chama o provider e status fica needs_review (tem GTIN)", async () => {
    const { svc, lookupByGtin } = makeDeps({ cached: { found: false, payload: null } });
    const result = await svc.enrichProduct("p1");

    expect(lookupByGtin).not.toHaveBeenCalled();
    expect(result.found).toBe(false);
    expect(result.status).toBe("needs_review");
  });
});

describe("EnrichmentService — status por score", () => {
  it("score >= 70 com dados completos → enriched", async () => {
    const { svc, update } = makeDeps({
      product: baseProduct({ packageSize: "1L" }),
      cached: {
        found: true,
        payload: {
          gtin: VALID_GTIN,
          name: "Refri",
          brand: "Marca",
          unit: "2L",
          cosmosCategory: "Refrigerantes",
        },
      },
      classify: { slug: "bebidas", confidence: 0.9 },
      categoryBySlug: { bebidas: { id: "cat-beb" } },
      categoryById: { "cat-beb": { slug: "bebidas" } },
    });
    const result = await svc.enrichProduct("p1");

    // name25 + gtin15 + brand15 + category15 + packageSize10 = 80
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.status).toBe("enriched");
    expect(update.mock.calls[0][0].data.enrichmentStatus).toBe("enriched");
  });

  it("score baixo com provider encontrado → needs_review", async () => {
    const { svc, update } = makeDeps({
      cached: { found: true, payload: { gtin: VALID_GTIN, name: "Só nome" } },
    });
    const result = await svc.enrichProduct("p1");

    // name25 + gtin15 = 40 < 70
    expect(result.score).toBeLessThan(70);
    expect(result.status).toBe("needs_review");
    expect(update.mock.calls[0][0].data.enrichmentStatus).toBe("needs_review");
  });
});
